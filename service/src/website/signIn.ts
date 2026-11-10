// A member's first entry through SSO: today's sign-in effects, run once. The website platform's identity mapping calls
// it, in one mutation, once it knows the Slack identity behind the SSO email and finds no `users` row for it. A member who
// signed in before the move has that row already, so they get no second greeting. Today's convex/website/signIn.ts,
// which Convex Auth called on every Slack sign-in.
import { and, eq } from "drizzle-orm";
import type { Id } from "../db/columns.ts";
import { fromDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { users } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberGreetedEvent } from "../bus/events.ts";
import { welcomeItemOwedTo } from "../album/items/welcome.ts";
import { signInWorkspace } from "../slack/signIn.ts";
import { verifyLater } from "../slack/verifyMember.ts";
import { lookup, type MemberFacts } from "../workspace/directory.ts";
import { websiteOpen, websiteShownTo } from "./flag.ts";

/** Who entered: the Slack pair behind the SSO email, and the display fields the identity mapping found for them. */
export type SignedIn = { workspace: string; user: string; name?: string; givenName?: string; familyName?: string; image?: string };

/** Why a first entry records nothing. Thrown before any write, so the caller's mutation rolls back clean. */
export class SignInRefused extends Error {
  readonly reason: "closed" | "another-workspace";
  constructor(reason: "closed" | "another-workspace") {
    super(reason === "closed" ? "the website is closed, so nobody signs in" : "a sign-in from another workspace is not allowed here");
    this.name = "SignInRefused";
    this.reason = reason;
  }
}

/** The member's `users` row, recorded with today's sign-in effects on their first entry. */
export async function rememberSignedInMember(ctx: MutationContext, signedIn: SignedIn): Promise<Id<"users">> {
  if (signedIn.workspace !== signInWorkspace()) throw new SignInRefused("another-workspace");
  const known = await userOf(ctx, signedIn.workspace, signedIn.user);
  if (known !== null) return known;
  const person = await lookup(ctx, signedIn.workspace, signedIn.user);
  if (!(await admitted(ctx, person))) throw new SignInRefused("closed");
  if (person === undefined) await verifyLater(ctx, signedIn.workspace, signedIn.user, { firstSignIn: true });
  return firstSignIn(ctx, signedIn, person);
}

const byChatIdentity = indexOrder(users, ["chatIdentity$workspace", "chatIdentity$user"]);

/** The `users` row of this Slack pair, or `null`; two fail, as `.unique()` did. */
export async function userOf(ctx: QueryContext, workspace: string, user: string): Promise<Id<"users"> | null> {
  const rows = await ctx.tx
    .select({ _id: users._id })
    .from(users)
    .where(and(eq(users.chatIdentity$workspace, workspace), eq(users.chatIdentity$user, user)))
    .orderBy(...byChatIdentity.orderBy())
    .limit(2);
  return (unique("users", rows)?._id as Id<"users"> | undefined) ?? null;
}

async function firstSignIn(ctx: MutationContext, { workspace, user, ...display }: SignedIn, person: MemberFacts | undefined): Promise<Id<"users">> {
  const row = ctx.newRow();
  await ctx.tx.insert(users).values(fromDocument(users, { ...row, ...present(display), chatIdentity: { workspace, user } }) as typeof users.$inferInsert);
  if (person?.kind === "member") {
    const greeted: MemberGreetedEvent = { type: "memberGreeted", workspace, member: person.member, owesTheWelcomeItem: await welcomeItemOwedTo(ctx, person.member), at: ctx.now };
    await ctx.publish(greeted);
  }
  return row._id as Id<"users">;
}

async function admitted(ctx: MutationContext, person: MemberFacts | undefined) {
  const shownToMember = person?.kind === "member" && (await websiteShownTo(ctx, person.member));
  return shownToMember || (await websiteOpen(ctx));
}

function present(fields: Omit<SignedIn, "workspace" | "user">) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""));
}
