// Member verification, as today's convex/slack/verifyMember.ts: a sign-in asks Slack whether the person is a member of
// the workspace, three tries at most with a doubling backoff that honours Slack's retry delay, and a sweep every ten
// minutes tries again the verifications a crash stranded. A member verified on their first sign-in is greeted.
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { welcomeItemOwedTo } from "../album/items/welcome.ts";
import type { MemberGreetedEvent } from "../bus/events.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import type { Doc } from "../db/schema/index.ts";
import { firstSignIns, memberVerifications } from "../db/schema/index.ts";
import { actionJob, mutationJob } from "../jobs/define.ts";
import type { ActionContext, MutationContext, QueryContext } from "../operations.ts";
import { zv } from "../values.ts";
import { readyFromTheStartOnceVerified } from "../website/flag.ts";
import { lookup } from "../workspace/directory.ts";
import { deleteRow, insertRow, patchRow, uniqueRow } from "../workspace/rows.ts";
import { lookUpUser, type LookUp } from "./directory.ts";
import { convexActionTimeLimitMs, strandedPerSweep } from "./strandedJobs.ts";

export const verificationTries = 3;
const firstRetryMs = 1000;

const personArgs = { workspace: z.string(), user: z.string() };

export async function verifyLater(ctx: MutationContext, workspace: string, user: string, { firstSignIn }: { firstSignIn: boolean }): Promise<void> {
  const earlier = await verificationOf(ctx, workspace, user);
  if (earlier?.state === "pending") return;
  const fresh = { attempts: 0, state: "pending" as const, nextTryAt: ctx.now };
  if (earlier === null) await insertRow(ctx, memberVerifications, { workspace, user, ...fresh });
  else await patchRow(ctx, memberVerifications, earlier._id, fresh);
  if (firstSignIn) await rememberFirstSignIn(ctx, workspace, user);
  await ctx.jobs.enqueue(verifyMemberJob, { workspace, user });
}

async function rememberFirstSignIn(ctx: MutationContext, workspace: string, user: string) {
  if ((await firstSignInOf(ctx, workspace, user)) === null) await insertRow(ctx, firstSignIns, { workspace, user });
}

const firstSignInByUser = indexOrder(firstSignIns, ["workspace", "user"]);

function firstSignInOf(ctx: QueryContext, workspace: string, user: string) {
  return uniqueRow<Doc<"firstSignIns">>(ctx, firstSignIns, and(eq(firstSignIns.workspace, workspace), eq(firstSignIns.user, user)), firstSignInByUser);
}

const verificationByUser = indexOrder(memberVerifications, ["workspace", "user"]);

export function verificationOf(ctx: QueryContext, workspace: string, user: string): Promise<null | Doc<"memberVerifications">> {
  return uniqueRow<Doc<"memberVerifications">>(ctx, memberVerifications, and(eq(memberVerifications.workspace, workspace), eq(memberVerifications.user, user)), verificationByUser);
}

export const verifyMemberArgs = z.strictObject(personArgs);
export async function verifyMember(ctx: ActionContext, { workspace, user }: z.infer<typeof verifyMemberArgs>): Promise<void> {
  const answer = await lookUpOrFail(ctx, workspace, user);
  const retryAfterMs = answer.kind === "failed" ? answer.retryAfterMs : undefined;
  await ctx.run.mutation("slack.verifyMember.recordAttempt", (mutation) => recordAttempt(mutation, { workspace, user, found: answer.kind === "found", retryAfterMs }));
}
export const verifyMemberJob = actionJob("slack.verifyMember.verifyMember", verifyMemberArgs, verifyMember);

async function lookUpOrFail(ctx: ActionContext, workspace: string, user: string): Promise<LookUp> {
  try {
    return await lookUpUser(ctx, workspace, user);
  } catch (error) {
    await ctx.run.mutation("slack.verifyMember.recordAttempt", (mutation) => recordAttempt(mutation, { workspace, user, found: false }));
    throw error;
  }
}

export const recordAttemptArgs = z.strictObject({ ...personArgs, found: z.boolean(), retryAfterMs: z.optional(zv.number()) });
export async function recordAttempt(ctx: MutationContext, { workspace, user, found, retryAfterMs }: z.infer<typeof recordAttemptArgs>): Promise<void> {
  const verification = await verificationOf(ctx, workspace, user);
  if (verification === null) return;
  if (found) return verified(ctx, verification);
  const attempts = verification.attempts + 1;
  if (attempts >= verificationTries) return failed(ctx, verification, attempts);
  const waitMs = Math.max(retryAfterMs ?? 0, firstRetryMs * 2 ** (attempts - 1));
  await patchRow(ctx, memberVerifications, verification._id, { attempts, nextTryAt: ctx.now + waitMs });
  await ctx.jobs.enqueue(verifyMemberJob, { workspace, user }, { after: waitMs });
}

async function verified(ctx: MutationContext, verification: Doc<"memberVerifications">) {
  await deleteRow(ctx, memberVerifications, verification._id);
  const wasFirstSignIn = await forgetFirstSignIn(ctx, verification.workspace, verification.user);
  const person = await lookup(ctx, verification.workspace, verification.user);
  if (person?.kind !== "member") return;
  await readyFromTheStartOnceVerified(ctx, person.member);
  if (!wasFirstSignIn) return;
  const greeted: MemberGreetedEvent = { type: "memberGreeted", workspace: verification.workspace, member: person.member, owesTheWelcomeItem: await welcomeItemOwedTo(ctx, person.member), at: ctx.now };
  await ctx.publish(greeted);
}

async function forgetFirstSignIn(ctx: MutationContext, workspace: string, user: string): Promise<boolean> {
  const firstSignIn = await firstSignInOf(ctx, workspace, user);
  if (firstSignIn !== null) await deleteRow(ctx, firstSignIns, firstSignIn._id);
  return firstSignIn !== null;
}

function failed(ctx: MutationContext, verification: Doc<"memberVerifications">, attempts: number) {
  return patchRow(ctx, memberVerifications, verification._id, { attempts, state: "failed" });
}

const byStateAndNextTry = indexOrder(memberVerifications, ["state", "nextTryAt"]);

export const retryStrandedArgs = z.strictObject({});
export async function retryStranded(ctx: MutationContext, _: z.infer<typeof retryStrandedArgs>): Promise<void> {
  const stranded = (
    await ctx.tx
      .select()
      .from(memberVerifications)
      .where(and(eq(memberVerifications.state, "pending"), gte(memberVerifications.nextTryAt, 0), lt(memberVerifications.nextTryAt, ctx.now - convexActionTimeLimitMs)))
      .orderBy(...byStateAndNextTry.orderBy())
      .limit(strandedPerSweep)
  ).map((row) => toDocument<Doc<"memberVerifications">>(memberVerifications, row));
  for (const verification of stranded) await tryAgainCountingTheStrandedTry(ctx, verification);
  if (stranded.length === strandedPerSweep) await ctx.jobs.enqueue(retryStrandedJob, {});
}
export const retryStrandedJob = mutationJob("slack.verifyMember.retryStranded", retryStrandedArgs, retryStranded);

async function tryAgainCountingTheStrandedTry(ctx: MutationContext, verification: Doc<"memberVerifications">) {
  const { _id, workspace, user, attempts } = verification;
  if ((await lookup(ctx, workspace, user))?.kind === "member") return verified(ctx, verification);
  const attemptsWithStrandedTry = attempts + 1;
  if (attemptsWithStrandedTry >= verificationTries) return failed(ctx, verification, attemptsWithStrandedTry);
  await patchRow(ctx, memberVerifications, _id, { attempts: attemptsWithStrandedTry, nextTryAt: ctx.now });
  await ctx.jobs.enqueue(verifyMemberJob, { workspace, user });
}
