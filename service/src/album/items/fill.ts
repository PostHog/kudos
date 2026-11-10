// The item fill: walks every member in the order they joined and, for each, earns the items of the packs and tray
// items that came before the item ledger, then drops the hoggies of the level-ups that wait face down. Each page is one
// job, scheduled by the one before, so a member's walk resumes where it stopped. Today's convex/album/items/fill.ts over
// the service's transaction; every per-row write is guarded against running twice, which the move's restart relies on.
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { zv } from "../../values.ts";
import { toDocument } from "../../db/documents.ts";
import { indexOrder } from "../../db/indexOrder.ts";
import { paginate } from "../../db/page.ts";
import { members, thoughtfulPacks, trayItems, type Doc } from "../../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { mutationJob } from "../../jobs/define.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { dropLevelUpHoggies, type LevelUp } from "../levelUpHoggies.ts";
import { earnTrayItem } from "../opening.ts";
import { earnItemsOfAPackGivenBeforeTheLedger } from "../packs.ts";
import { waitingPageOf } from "./ledger.ts";

export const mostFilledOfAKind = 100;

const fillStepValidator = z.strictObject({ member: zv.id("members"), kind: z.union([z.literal("packs"), z.literal("tray"), z.literal("levels")]), cursor: z.optional(z.string()) });

type FillStep = z.infer<typeof fillStepValidator>;

type Filled = { isDone: boolean; continueCursor: string };

// The indexes Convex's fill walked: unopened packs by giver, waiting tray items by member, and members by when they joined.
const byGiverOpenedAt = indexOrder(thoughtfulPacks, ["giver", "openedAt", "at"]);
const byMemberPutIn = indexOrder(trayItems, ["member", "putInAt"]);
const byCreationTime = indexOrder(members, []);

export const fillItemsArgs = z.strictObject({ step: z.optional(fillStepValidator) });
export async function fillItems(ctx: MutationContext, { step }: z.infer<typeof fillItemsArgs>): Promise<null> {
  const filling = step ?? (await firstStepAfter(ctx, null));
  const next = filling === null ? null : await fill(ctx, filling);
  if (next !== null) await ctx.jobs.enqueue(fillItemsJob, { step: next });
  return null;
}
export const fillItemsJob = mutationJob("album.items.fill.fillItems", fillItemsArgs, fillItems);

const fillers = { packs: fillPacks, tray: fillTray, levels: revealLevels } as const;

async function fill(ctx: MutationContext, step: FillStep): Promise<FillStep | null> {
  const { isDone, continueCursor } = await fillers[step.kind](ctx, step);
  if (!isDone) return { ...step, cursor: continueCursor };
  if (step.kind === "packs") return { member: step.member, kind: "tray" };
  if (step.kind === "tray") return { member: step.member, kind: "levels" };
  return stepAfterTheMember(ctx, step.member);
}

// The next member in the order they joined: by `_creationTime`, then `_id`, so one loaded with the same stamp as the
// member just filled is next, not skipped.
async function stepAfterTheMember(ctx: QueryContext, member: MemberId): Promise<FillStep | null> {
  const [filled] = await ctx.tx.select({ _id: members._id, _creationTime: members._creationTime }).from(members).where(eq(members._id, member));
  return filled === undefined ? null : firstStepAfter(ctx, filled);
}

async function fillPacks(ctx: MutationContext, { member, cursor }: FillStep): Promise<Filled> {
  const where = and(eq(thoughtfulPacks.giver, member), isNull(thoughtfulPacks.openedAt));
  const { page, isDone, continueCursor } = await paginate<Doc<"thoughtfulPacks">>(ctx.tx, { table: thoughtfulPacks, order: byGiverOpenedAt, where }, { cursor: cursor ?? null, numItems: mostFilledOfAKind });
  for (const pack of page) await earnItemsOfAPackGivenBeforeTheLedger(ctx, pack);
  return { isDone, continueCursor };
}

async function fillTray(ctx: MutationContext, { member, cursor }: FillStep): Promise<Filled> {
  const where = and(eq(trayItems.member, member), isNull(trayItems.putInAt));
  const { page, isDone, continueCursor } = await paginate<Doc<"trayItems">>(ctx.tx, { table: trayItems, order: byMemberPutIn, where }, { cursor: cursor ?? null, numItems: mostFilledOfAKind });
  for (const item of page) await earnTrayItemOf(ctx, item);
  return { isDone, continueCursor };
}

async function revealLevels(ctx: MutationContext, { member, cursor }: FillStep): Promise<Filled> {
  const { page, isDone, continueCursor } = await waitingPageOf(ctx, member, cursor ?? null, mostFilledOfAKind);
  for (const levelUp of levelUpsAmong(page)) await dropLevelUpHoggies(ctx, levelUp);
  return { isDone, continueCursor };
}

function levelUpsAmong(items: Doc<"items">[]): LevelUp[] {
  const reached = new Map<number, LevelUp>();
  for (const { workspace, member, reason, earnedAt } of items) if (reason.kind === "levelUp") reached.set(reason.level, { workspace, member, level: reason.level, at: earnedAt });
  return [...reached.values()];
}

async function earnTrayItemOf(ctx: MutationContext, item: Doc<"trayItems">) {
  const [row] = await ctx.tx.select().from(thoughtfulPacks).where(eq(thoughtfulPacks._id, item.pack));
  if (row !== undefined) await earnTrayItem(ctx, item, toDocument<Doc<"thoughtfulPacks">>(thoughtfulPacks, row));
}

async function firstStepAfter(ctx: QueryContext, after: { _id: string; _creationTime: number } | null): Promise<FillStep | null> {
  const [next] = await ctx.tx.select({ _id: members._id }).from(members).where(after === null ? undefined : byCreationTime.after(after)).orderBy(...byCreationTime.orderBy()).limit(1);
  return next === undefined ? null : { member: next._id as MemberId, kind: "packs" };
}
