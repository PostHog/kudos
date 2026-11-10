// Effects records: what each award paid each side, written once when its kudos is recorded and never changed.
// Today's convex/progression/effects.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import { weekOf, type DayKey } from "../engine/allowance.ts";
import { awardAt, givenEarlierInWeek, type AwardId } from "../engine/awards.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { effectsRecords, type Doc } from "../db/schema/index.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { GateDecision } from "./gate.ts";
import { bonusPaidIn, type BonusLine, type EffectsRecord, type Side, type EarlierAward } from "./progress.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const progressionWaitedFor = 10 * 60_000;

const byAward = indexOrder(effectsRecords, ["award", "side"]);
const byMemberSide = indexOrder(effectsRecords, ["member", "side"]);

export async function insertEffects(ctx: MutationContext, effects: EffectsRecord[]): Promise<void> {
  for (const record of effects) await ctx.tx.insert(effectsRecords).values(fromDocument(effectsRecords, { ...ctx.newRow(), ...record }) as typeof effectsRecords.$inferInsert);
}

export async function isRecorded(ctx: QueryContext, award: AwardId, side: Side): Promise<boolean> {
  return (await recordOf(ctx, award, side)) !== null;
}

export async function xpRecordedFor(ctx: QueryContext, award: AwardId, side: Side): Promise<number | null> {
  const recorded = await recordOf(ctx, award, side);
  if (recorded === null) return null;
  return recorded.baseXp + bonusPaidIn([recorded]).reduce((sum, { xp }) => sum + xp, 0);
}

export async function gateRecordedWith(ctx: QueryContext, award: AwardId): Promise<GateDecision | null> {
  return (await giverRecordOf(ctx, award))?.gate ?? null;
}

export async function bonusRecordedWith(ctx: QueryContext, awards: AwardId[]): Promise<BonusLine[]> {
  const recorded: Doc<"effectsRecords">[] = [];
  for (const award of awards) {
    const record = await giverRecordOf(ctx, award);
    if (record !== null) recorded.push(record);
  }
  return bonusPaidIn(recorded);
}

function giverRecordOf(ctx: QueryContext, award: AwardId) {
  return recordOf(ctx, award, "giver");
}

/** The first record of the award's side, in index order, as `.first()` read it. */
async function recordOf(ctx: QueryContext, award: AwardId, side: Side): Promise<Doc<"effectsRecords"> | null> {
  const [row] = await ctx.tx
    .select()
    .from(effectsRecords)
    .where(and(eq(effectsRecords.award, award), eq(effectsRecords.side, side)))
    .orderBy(...byAward.orderBy())
    .limit(1);
  return row ? toDocument<Doc<"effectsRecords">>(effectsRecords, row) : null;
}

export function awardsBefore(ctx: QueryContext, giver: MemberId, day: DayKey, award: AwardId): Promise<EarlierAward[]> {
  return givenEarlierInWeek(ctx, giver, weekOf(day), award);
}

/** Pages the giver's records in index order, as today's `for await` streamed them, and stops at the first that counts. */
export async function gaveThoughtfulKudos(ctx: QueryContext, giver: MemberId, atOrBefore: number): Promise<boolean> {
  let after: Doc<"effectsRecords"> | undefined;
  for (;;) {
    const rows = await ctx.tx
      .select()
      .from(effectsRecords)
      .where(and(eq(effectsRecords.member, giver), eq(effectsRecords.side, "giver"), after && byMemberSide.after(after)))
      .orderBy(...byMemberSide.orderBy())
      .limit(givenAPage);
    for (const row of rows) {
      const { gate, award } = (after = toDocument<Doc<"effectsRecords">>(effectsRecords, row));
      if (gate?.thoughtful === true && ((await awardAt(ctx, award)) ?? Infinity) <= atOrBefore) return true;
    }
    if (rows.length < givenAPage) return false;
  }
}

const givenAPage = 100;
