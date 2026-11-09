import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export type Target = {
  // Which app the target runs: today's app, the oracle every journey passes against, or the rewrite, which passes the
  // journeys on its supported list (rewrite/supported.txt). A journey only one of them can pass skips on the other.
  kind: TargetKind;
  appUrl: string;
  signingSecret: string;
  workspace: string;
  appId: string;
  fakesUrl: string;
  // How a member signs in to the website: today's app with Slack, the rewrite through the edge in front of it.
  signIn: SignInMechanism;
  // The app's time seam (see time.ts) and the test-only secret it asks for. A target without a secret has no clock to
  // move, so its journeys tagged @time can't run.
  timeUrl?: string;
  testSecret?: string;
  // A target on the hosting platform, as the promotion gate runs (see journeys tagged @sandbox): its real edge in front,
  // real Slack behind, and no fakes, so it names no KUDOS_FAKES_URL and runs only journeys that need none.
  hosted?: boolean;
  // Where a hosted edge sends a visitor who hasn't signed in: the start of its sign-in URL.
  edgeSignInUrl?: string;
};

export const targetKinds = ["oracle", "rewrite"] as const;

export type TargetKind = (typeof targetKinds)[number];

export const signInMechanisms = ["slack-openid", "edge-header"] as const;

export type SignInMechanism = (typeof signInMechanisms)[number];

const names = {
  kind: "KUDOS_TARGET_KIND",
  appUrl: "KUDOS_APP_URL",
  signingSecret: "KUDOS_SLACK_SIGNING_SECRET",
  workspace: "KUDOS_SLACK_WORKSPACE",
  appId: "KUDOS_SLACK_APP_ID",
  fakesUrl: "KUDOS_FAKES_URL",
  signIn: "KUDOS_SIGN_IN",
  timeUrl: "KUDOS_TIME_URL",
  testSecret: "KUDOS_TEST_SECRET",
  hosted: "KUDOS_HOSTED",
  edgeSignInUrl: "KUDOS_EDGE_SIGN_IN_URL",
} as const satisfies Record<keyof Target, string>;

export function targetLines(target: Target) {
  return (Object.keys(names) as Array<keyof Target>)
    .filter((key) => target[key] !== undefined)
    .map((key) => `${names[key]}=${target[key]}\n`)
    .join("");
}

export function targetOf(file = process.env.E2E_TARGET): Target {
  if (!file) throw new Error("E2E_TARGET names no target file: run `pnpm e2e` for the local app, or set E2E_TARGET to a target's env file (see e2e/README.md)");
  const variables = parseEnv(readFileSync(file, "utf8"));
  const read = (key: keyof Target) => {
    const value = variables[names[key]];
    if (!value) throw new Error(`the target file ${file} sets no ${names[key]}`);
    return value;
  };
  const appUrl = read("appUrl");
  const kind = variables[names.kind] ?? "oracle";
  if (!(targetKinds as readonly string[]).includes(kind)) throw new Error(`the target file ${file} sets ${names.kind}=${kind}, but a target runs only ${targetKinds.join(" or ")}`);
  const hosted = variables[names.hosted] === "true";
  const signIn = variables[names.signIn] ?? "slack-openid";
  if (!(signInMechanisms as readonly string[]).includes(signIn)) throw new Error(`the target file ${file} sets ${names.signIn}=${signIn}, but journeys sign in only by ${signInMechanisms.join(", ")}`);
  return {
    kind: kind as TargetKind,
    appUrl,
    signingSecret: read("signingSecret"),
    workspace: read("workspace"),
    appId: read("appId"),
    fakesUrl: hosted ? "" : read("fakesUrl"),
    signIn: signIn as SignInMechanism,
    // The rewrite serves the seam beside its other routes; the local runner serves today's app's seam itself.
    timeUrl: variables[names.timeUrl] || `${appUrl}/testing/time`,
    testSecret: variables[names.testSecret] || undefined,
    hosted,
    edgeSignInUrl: variables[names.edgeSignInUrl] || undefined,
  };
}
