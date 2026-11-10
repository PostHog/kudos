// Today's member check for a website read: the person the request signs in as (identity.ts maps the edge's email to
// them), verified against the directory and the website flag. Today's convex/website/memberQuery.ts, with the edge's
// identity for Convex Auth's session; the display fields still come from the person's users row, when they have one.
import { and, asc, eq } from "drizzle-orm";
import type { HomeMember } from "../feedback/homes.ts";
import { users } from "../db/schema/index.ts";
import type { Doc } from "../db/schema/index.ts";
import { toDocument } from "../db/documents.ts";
import { signInWorkspace } from "../slack/signIn.ts";
import { verificationOf } from "../slack/verifyMember.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import type { Identity, SignedIn } from "./api/transport.ts";
import { websiteOpenTo, websiteOpenWithoutWriting } from "./flag.ts";

export type Denial = { kind: "closed" } | { kind: "signed-out" } | { kind: "verifying" } | { kind: "unverified" } | { kind: "not-a-member" };

export type VerifiedMember = {
  member: MemberId;
  workspace: string;
  user: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  image?: string;
};

export type Verified = { me: VerifiedMember; person: HomeMember };

const closed: Denial = { kind: "closed" };

/** The member the request signs in as, while the website is open to them; otherwise the denial a read answers. */
export async function verifiedMember(ctx: QueryContext, identity: Identity): Promise<Verified | Denial> {
  if ("kind" in identity) return answerWhileOpen(ctx, identity);
  if (identity.workspace !== signInWorkspace()) return answerWhileOpen(ctx, { kind: "signed-out" });
  const verified = await directoryAnswer(ctx, { ...identity, ...(await displayFieldsOf(ctx, identity)) });
  if ("kind" in verified) return answerWhileOpen(ctx, verified);
  return (await websiteOpenTo(ctx, verified.me.member)) ? verified : closed;
}

// Closed to the workspace, every denial reads closed: the website says nothing more about who may sign in.
async function answerWhileOpen(ctx: QueryContext, denial: Denial): Promise<Denial> {
  return (await websiteOpenWithoutWriting(ctx)) ? denial : closed;
}

async function directoryAnswer(ctx: QueryContext, signedIn: SignedIn): Promise<Verified | Denial> {
  const person = await lookup(ctx, signedIn.workspace, signedIn.user);
  if (person === undefined) {
    const verification = await verificationOf(ctx, signedIn.workspace, signedIn.user);
    return { kind: verification?.state === "failed" ? "unverified" : "verifying" };
  }
  if (person.kind !== "member") return { kind: "not-a-member" };
  return { me: { member: person.member, ...signedIn }, person };
}

// The name and picture of the person's users row, the first by the index's order when there are several.
async function displayFieldsOf(ctx: QueryContext, { workspace, user }: SignedIn): Promise<Partial<Pick<VerifiedMember, "name" | "givenName" | "familyName" | "image">>> {
  const [row] = await ctx.tx
    .select()
    .from(users)
    .where(and(eq(users.chatIdentity$workspace, workspace), eq(users.chatIdentity$user, user)))
    .orderBy(asc(users._creationTime), asc(users._id))
    .limit(1);
  if (row === undefined) return {};
  const { name, givenName, familyName, image } = toDocument<Doc<"users">>(users, row);
  return present({ name, givenName, familyName, image });
}

function present<Fields extends Record<string, string | undefined>>(fields: Fields): Partial<Record<keyof Fields, string>> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<Record<keyof Fields, string>>;
}
