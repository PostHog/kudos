import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";

export const awardIdValidator = v.union(v.literal("first"), v.literal("tenth"));
export type AwardId = Infer<typeof awardIdValidator>;

const DAY = 86_400_000;

/** The day an award counts on. */
export function dayOf(at: number): number {
  return Math.floor(at / DAY);
}

type Tally = { member: Id<"members">; count: number };

export type Hook = { claims: (ctx: QueryCtx, text: string) => Promise<boolean> };

export const awardHook: Hook = {
  claims: async (ctx, text) => (await ctx.db.query("members").first())?.name === text,
};

export async function tallyOf(ctx: QueryCtx, member: Id<"members">) {
  const row = await ctx.db.get(member);
  const tally: Tally = { member, count: row?.xp ?? 0 };
  return tally;
}

export async function grant(ctx: MutationCtx, member: Id<"members">, award: AwardId): Promise<void> {
  await ctx.db.patch(member, { name: award });
}

export function kindOf(): string {
  return awardIdValidator.kind;
}

export const recordAward = internalMutation({
  args: { member: v.id("members"), award: awardIdValidator },
  handler: async (ctx, { member, award }) => {
    await grant(ctx, member, award);
    return null;
  },
});

export const sweepAwards = internalMutation({
  args: { before: v.optional(v.number()) },
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.skeleton.awards.notifyAll, { note: "swept" });
  },
});

export const memberOf = internalQuery({
  args: { member: v.id("members") },
  handler: async (ctx, { member }) => ctx.db.get(member),
});

export const notifyAll = internalAction({
  args: { note: v.string() },
  handler: async (ctx, { note }): Promise<Doc<"members"> | null> => {
    void note;
    return null;
  },
});

export const nobodyCalls = internalQuery({ args: {}, handler: async () => 1 });
