import Slack from "@auth/core/providers/slack";

export type SignedInProfile = {
  id: `${string}/${string}`;
  chatWorkspace: string;
  chatUser: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  image?: string;
};

export type SlackClaims = Partial<
  Record<"https://slack.com/team_id" | "https://slack.com/user_id" | "name" | "given_name" | "family_name" | "picture", unknown>
>;

export const signInScope = "openid profile";

export function slackSignIn() {
  const workspace = signInWorkspace();
  return Slack({
    issuer: process.env.SLACK_OIDC_ISSUER ?? "https://slack.com",
    checks: ["state", "nonce"],
    authorization: { params: { scope: signInScope, ...(workspace && { team: workspace }) } },
    profile: (claims: SlackClaims) => signedInProfile(claims, signInWorkspace()),
  });
}

export function signInWorkspace(): string | undefined {
  const workspace = (process.env.SLACK_WORKSPACE_ID ?? "").trim();
  return workspace === "" ? undefined : workspace;
}

export function signedInProfile(claims: SlackClaims, allowedWorkspace: string | undefined): SignedInProfile {
  const profile = {
    chatWorkspace: claims["https://slack.com/team_id"],
    chatUser: claims["https://slack.com/user_id"],
    name: claims.name,
    givenName: claims.given_name,
    familyName: claims.family_name,
    image: claims.picture,
  };
  return allowedProfile(profile, allowedWorkspace);
}

export function allowedSignIn(profile: Record<string, unknown>): SignedInProfile {
  return allowedProfile(profile, signInWorkspace());
}

function allowedProfile(profile: Record<string, unknown>, allowedWorkspace: string | undefined): SignedInProfile {
  if (allowedWorkspace === undefined) throw new Error("SLACK_WORKSPACE_ID is not set, so nobody signs in");
  const workspace = requiredClaim(profile.chatWorkspace, "https://slack.com/team_id");
  const user = requiredClaim(profile.chatUser, "https://slack.com/user_id");
  if (workspace !== allowedWorkspace) throw new Error("a sign-in from another workspace is not allowed here");
  return {
    id: `${workspace}/${user}`,
    chatWorkspace: workspace,
    chatUser: user,
    ...optionalClaim("name", profile.name),
    ...optionalClaim("givenName", profile.givenName),
    ...optionalClaim("familyName", profile.familyName),
    ...optionalClaim("image", profile.image),
  };
}

function requiredClaim(value: unknown, claim: keyof SlackClaims) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Slack sent no ${claim} claim`);
  return value;
}

function optionalClaim<Field extends string>(field: Field, value: unknown) {
  return typeof value === "string" && value !== "" ? ({ [field]: value } as Record<Field, string>) : {};
}
