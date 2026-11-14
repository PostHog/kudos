// Unlocks: a member's features, locked until their level makes them ready, then opened once.
// Today's convex/unlocks/unlocks.ts over the service's transaction.
import { and, eq, gt, lt, lte, type SQL } from "drizzle-orm";
import { featureOpeningRarities } from "../album/hoggies/rarityCaps.ts";
import { dropFor } from "../album/hoggies/drops.ts";
import { levelReachedEventValidator, type UnlockOpenedEvent, type UnlockReadyEvent } from "../bus/events.ts";
import type { Surface } from "../commands/surface.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { paginate } from "../db/page.ts";
import { unique } from "../db/unique.ts";
import { levelUps, unlocks, type Doc } from "../db/schema/index.ts";
import type { DecidedBelow } from "../engine/awards.ts";
import { republish } from "../feedback/homes.ts";
import { notifyLevelReached } from "../feedback/notify.ts";
import { xpLevelsOnFor } from "../progression/xpLevels.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { featureCrateKeyOf, type Feature } from "./feature.ts";
import { unlockPathShownTo, unlocksLiveFor, unlocksShownTo } from "./launch.ts";
import { readyFromTheStart, schedule, scheduled, shippedTo, type ScheduledFeature } from "./schedule.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export type UnlockState = "unshipped" | "locked" | "ready" | "open";

export type MemberUnlock = { feature: Feature; state: Exclude<UnlockState, "unshipped">; readyAt: number | null; openedAt: number | null };

export type UnlocksHome = { ready: ScheduledFeature[]; next: ScheduledFeature | null };

export const makeReadyArgs = z.strictObject({ event: levelReachedEventValidator });
export async function makeReady(ctx: MutationContext, { event }: z.infer<typeof makeReadyArgs>): Promise<void> {
  const { workspace, member, level, at } = event;
  if ((await levelUpOf(ctx, member, level)) !== null) return;
  await unlocksLiveFor(ctx, member);
  const madeReady = await storeReadiness(ctx, { workspace, member, at }, reachedAt(await shippedTo(ctx, member), level));
  await ctx.tx.insert(levelUps).values(fromDocument(levelUps, { ...ctx.newRow(), member, level, ready: madeReady.map(({ feature }) => feature), at }) as typeof levelUps.$inferInsert);
  await notifyLevelReached(ctx, event, madeReady);
  if (madeReady.length > 0 && (await xpLevelsOnFor(ctx, member))) await republish(ctx, member);
}
export const makeReadyJob = mutationJob("unlocks.unlocks.makeReady", makeReadyArgs, makeReady);

export async function openUnlock(ctx: MutationContext, member: MemberId, feature: Feature, surface: Surface): Promise<"done" | "refused"> {
  if (!(await unlocksShownTo(ctx, member))) return "refused";
  const { workspace } = await chatUserOf(ctx, member);
  if ((await stateOf(ctx, member, feature)) !== "ready") return "refused";
  const opening = { workspace, member, at: ctx.now };
  if (!(await storeOpening(ctx, opening, feature))) return "done";
  await dropFor(ctx, member, featureCrateKeyOf(feature), opening.at, { surface, rarities: featureOpeningRarities });
  await publishOpened(ctx, opening, feature);
  return "done";
}

export type Opening = { workspace: string; member: MemberId; at: number; byLaunch?: true };

export async function keepOpen(ctx: MutationContext, opening: Opening, feature: Feature): Promise<boolean> {
  if (!(await storeOpening(ctx, opening, feature))) return false;
  await publishOpened(ctx, opening, feature);
  return true;
}

async function storeOpening(ctx: MutationContext, { member, at }: Opening, feature: Feature): Promise<boolean> {
  const row = await unlockRow(ctx, member, feature);
  if (row?.openedAt !== undefined) return false;
  if (row === null) await ctx.tx.insert(unlocks).values({ ...ctx.newRow(), member, feature, readyAt: at, openedAt: at });
  else await ctx.tx.update(unlocks).set({ openedAt: at }).where(eq(unlocks._id, row._id));
  return true;
}

function publishOpened(ctx: MutationContext, { workspace, member, at, byLaunch }: Opening, feature: Feature) {
  const opened: UnlockOpenedEvent = { type: "unlockOpened", workspace, member, feature, at, ...(byLaunch && { byLaunch }) };
  return ctx.publish(opened);
}

export async function stateOf(ctx: QueryContext, member: MemberId, feature: Feature): Promise<UnlockState> {
  if ((await shippedTo(ctx, member, [scheduled(feature)])).length === 0) return "unshipped";
  return stateFrom(await unlockRow(ctx, member, feature));
}

export async function openedAtOf(ctx: QueryContext, member: MemberId, feature: Feature): Promise<number | null> {
  return (await unlockRow(ctx, member, feature))?.openedAt ?? null;
}

export async function unlocksOf(ctx: QueryContext, member: MemberId): Promise<MemberUnlock[]> {
  const memberUnlocks: MemberUnlock[] = [];
  for (const { feature } of await shippedTo(ctx, member)) {
    const row = await unlockRow(ctx, member, feature);
    memberUnlocks.push({ feature, state: stateFrom(row), readyAt: row?.readyAt ?? null, openedAt: row?.openedAt ?? null });
  }
  return memberUnlocks;
}

export type ReadyFeature = { feature: Feature; readyAt: number };

export async function readyFeaturesOf(ctx: QueryContext, member: MemberId, limit: number): Promise<ReadyFeature[]> {
  if (!(await unlockPathShownTo(ctx, member))) return [];
  const rows = (await ctx.tx.select().from(unlocks).where(eq(unlocks.member, member)).orderBy(...byMemberFeature.orderBy()).limit(limit)).map(asUnlock);
  const ready = rows.filter((row) => stateFrom(row) === "ready");
  const shipped = new Set((await shippedTo(ctx, member, ready.map(({ feature }) => scheduled(feature)))).map(({ feature }) => feature));
  return ready.filter(({ feature }) => shipped.has(feature)).map(({ feature, readyAt }) => ({ feature, readyAt }));
}

export async function unlocksHomeOf(ctx: QueryContext, member: MemberId): Promise<UnlocksHome> {
  const memberUnlocks = await unlocksOf(ctx, member);
  const withState = (state: MemberUnlock["state"]) => memberUnlocks.filter((unlock) => unlock.state === state).map(({ feature }) => scheduled(feature));
  return { ready: withState("ready"), next: withState("locked")[0] ?? null };
}

export async function withoutReadiness(ctx: QueryContext, member: MemberId, features: ScheduledFeature[]): Promise<ScheduledFeature[]> {
  const without: ScheduledFeature[] = [];
  for (const entry of features) if ((await unlockRow(ctx, member, entry.feature)) === null) without.push(entry);
  return without;
}

export async function makeReadyFromTheStart(ctx: MutationContext, workspace: string, member: MemberId): Promise<void> {
  const due = await withoutReadiness(ctx, member, schedule.features.filter(readyFromTheStart));
  if (due.length > 0) await storeReadiness(ctx, { workspace, member, at: ctx.now }, await shippedTo(ctx, member, due));
}

export function reachedAt(features: readonly ScheduledFeature[], level: number) {
  return features.filter((entry) => entry.level <= level);
}

export async function storeReadiness(ctx: MutationContext, { workspace, member, at }: { workspace: string; member: MemberId; at: number }, reached: ScheduledFeature[]): Promise<ScheduledFeature[]> {
  const madeReady: ScheduledFeature[] = [];
  for (const entry of reached) {
    if ((await unlockRow(ctx, member, entry.feature)) !== null) continue;
    await ctx.tx.insert(unlocks).values({ ...ctx.newRow(), member, feature: entry.feature, readyAt: at });
    const ready: UnlockReadyEvent = { type: "unlockReady", workspace, member, feature: entry.feature, at };
    await ctx.publish(ready);
    madeReady.push(entry);
  }
  return madeReady;
}

export type RecordedLevelUp = { level: number; at: number; created: number };

export async function* levelUpsByDecision(ctx: QueryContext, member: MemberId, below: DecidedBelow): AsyncGenerator<RecordedLevelUp> {
  const where = and(eq(levelUps.member, member), decidedWithin(below));
  let cursor: string | null = null;
  for (;;) {
    const { page, isDone, continueCursor }: Awaited<ReturnType<typeof paginate<Doc<"levelUps">>>> = await paginate<Doc<"levelUps">>(ctx.tx, { table: levelUps, order: byMember, where, direction: "desc" }, { cursor, numItems: levelUpsAPage });
    for (const { level, at, _creationTime } of page) yield { level, at, created: _creationTime };
    if (isDone) return;
    cursor = continueCursor;
  }
}

const levelUpsAPage = 100;

// `decidedBelow`'s bounds on the level-ups' recording time, `_creationTime`, as SQL.
function decidedWithin({ decided, inclusive, above }: DecidedBelow): SQL | undefined {
  const lower = above === undefined ? undefined : gt(levelUps._creationTime, above);
  if (decided === Infinity) return lower;
  return and(lower, inclusive ? lte(levelUps._creationTime, decided) : lt(levelUps._creationTime, decided));
}

function stateFrom(row: Doc<"unlocks"> | null): MemberUnlock["state"] {
  if (row === null) return "locked";
  return row.openedAt === undefined ? "ready" : "open";
}

const byMemberFeature = indexOrder(unlocks, ["member", "feature"]);
const byMemberLevel = indexOrder(levelUps, ["member", "level"]);
const byMember = indexOrder(levelUps, ["member"]);

const asUnlock = (row: Record<string, unknown>) => toDocument<Doc<"unlocks">>(unlocks, row);

/** The member's level-up at the level, or `null`; two fail, as `.unique()` did. */
async function levelUpOf(ctx: QueryContext, member: MemberId, level: number) {
  return unique("levelUps", await ctx.tx.select({ _id: levelUps._id }).from(levelUps).where(and(eq(levelUps.member, member), eq(levelUps.level, level))).orderBy(...byMemberLevel.orderBy()).limit(2));
}

/** The member's unlock of the feature, or `null`; two fail, as `.unique()` did. */
async function unlockRow(ctx: QueryContext, member: MemberId, feature: Feature): Promise<Doc<"unlocks"> | null> {
  const row = unique("unlocks", await ctx.tx.select().from(unlocks).where(and(eq(unlocks.member, member), eq(unlocks.feature, feature))).orderBy(...byMemberFeature.orderBy()).limit(2));
  return row === null ? null : asUnlock(row);
}
