// Hoggie drops, as today's convex/album/hoggies/drops.ts: one drop per member and crate, drawn from the member's own
// seed, with the member's tallies, the crest a find completes, the pack a drop pays, and the tray a thoughtful crate's
// drop waits in until it is put in.
import { and, eq, gt, isNull, lt, lte, type SQL } from "drizzle-orm";
import type { HoggieDroppedEvent } from "../../bus/events.ts";
import type { Surface } from "../../commands/surface.ts";
import { encodeStored } from "../../db/codec.ts";
import { fromDocument, toDocument } from "../../db/documents.ts";
import { indexOrder } from "../../db/indexOrder.ts";
import { drops, dropTallies, hoggieTallies, trayDrops, type Doc } from "../../db/schema/index.ts";
import { type DecidedBelow, fromTheNewestDecided } from "../../engine/awards.ts";
import type { MutationContext, QueryContext, Transaction } from "../../operations.ts";
import { applyGain } from "../../progression/progression.ts";
import type { AppliedReward } from "../../progression/rewards.ts";
import { chatUserOf, type MemberId } from "../../workspace/directory.ts";
import { catalogue, crestNamed, crestWith, firstVersionWithCrests, hoggieNamed, type Rarity } from "./catalogue.ts";
import { crateKindOf, type CrateKey } from "./crateKey.ts";
import { drawOf, packBonusOf, type Drawn } from "./draw.ts";
import { crestsShownFor, crestsShownTo, hoggiesDropFor, packsPayFor } from "./flag.ts";
import { rarityRangeFor, type RarityRange, type SourceRarities } from "./rarityCaps.ts";
import type { DropRecord } from "./records.ts";

export type HoggieArt = { kind: "hoggie"; slug: string };

export type CrestArt = { kind: "crest"; slug: string };

export type CompletedCrest = { crest: string; name: string; art: CrestArt };

export type Drop = { hoggie: string; name: string; rarity: Rarity; art: HoggieArt; copy: number; isNew: boolean; crest?: CompletedCrest | null };

export type CrestsShown = { crests: boolean };

export type DroppedAt = { at: number; n: number; decided: number; drop: Drop };

export type DropContext = RarityRange & { rarities?: SourceRarities; surface?: Surface; unowned?: boolean; waits?: boolean };

export type FindContext = { surface?: Surface; waits?: boolean };

// How many drops one read of a member's newest-first walk takes before it reads on from the last.
const walkBatch = 50;

const byMember = indexOrder(drops, ["member"]);

export async function dropFor(ctx: MutationContext, member: MemberId, crate: CrateKey, at: number, { floor, cap, weights, rarities, unowned = false, ...context }: DropContext): Promise<void> {
  if ((await dropRecordOf(ctx.tx, member, crate)) !== null || !(await hoggiesDropFor(ctx, member))) return;
  const range = rarities === undefined ? { floor, cap, weights } : await rarityRangeFor(ctx, member, rarities);
  const owned = unowned ? await ownedBy(ctx.tx, member) : undefined;
  await recordFind(ctx, member, crate, await drawOf({ secret: drawSecret(), member, crate, version: catalogue.version, ...range, owned }), at, context);
}

export async function recordFind(ctx: MutationContext, member: MemberId, crate: CrateKey, { hoggie, rarity }: Drawn, at: number, { surface, waits = false }: FindContext): Promise<void> {
  const n = await countDrop(ctx, member);
  const copy = waits ? await nextCopyOf(ctx.tx, member, hoggie) : await countFound(ctx, member, hoggie, at, n);
  const crest = waits ? crestDecidedAtThePutIn() : await crestRecordedFor(ctx.tx, member, hoggie, copy);
  const { workspace } = await chatUserOf(ctx, member);
  const pack = await packPaidFor(ctx, workspace, member, crate, at);
  await insert(ctx, drops, { member, crate, hoggie, rarity, n, copy, catalogueVersion: catalogue.version, at, ...crest, ...(pack && { pack }) });
  if (waits) await insert(ctx, trayDrops, { member, crate });
  if (crest.crest) await crestsShownFor(ctx, member);
  const dropped: HoggieDroppedEvent = { type: "hoggieDropped", workspace, member, crate, hoggie, rarity, copy, at, ...(pack && { pack: { xp: pack.xp, coins: pack.coins } }), ...(surface && { surface }) };
  await ctx.publish(dropped);
}

async function packPaidFor(ctx: MutationContext, workspace: string, member: MemberId, crate: CrateKey, at: number): Promise<AppliedReward | null> {
  const bonus = await packBonusOf({ secret: drawSecret(), member, crate });
  if (bonus === null || !(await packsPayFor(ctx, member))) return null;
  return applyGain(ctx, workspace, { member, ...bonus }, at);
}

export async function putDropIn(ctx: MutationContext, member: MemberId, crate: CrateKey, at: number): Promise<void> {
  const waiting = await trayDropOf(ctx.tx, member, crate);
  const drop = await dropRecordOf(ctx.tx, member, crate);
  if (waiting === null || waiting.putInAt !== undefined || drop === null) return;
  const copy = await countFound(ctx, member, drop.hoggie, at, await countDrop(ctx, member));
  const crest = await crestRecordedFor(ctx.tx, member, drop.hoggie, copy);
  await ctx.tx
    .update(trayDrops)
    .set({ putInAt: at, ...("crest" in crest && { crest: encodeStored(crest.crest ?? null) }) })
    .where(eq(trayDrops._id, waiting._id));
}

export async function lastFoundBy(ctx: QueryContext, member: MemberId): Promise<Drop | null> {
  const shown = { crests: false };
  const newest = await newestFoundOf(ctx, member, shown);
  const putIn = await lastPutInOf(ctx.tx, member);
  if (putIn === null || (newest !== null && newest.at >= putIn.at)) return newest?.drop ?? null;
  return shownDrop(putIn.record, shown);
}

async function newestFoundOf(ctx: QueryContext, member: MemberId, shown: CrestsShown): Promise<DroppedAt | null> {
  for await (const dropped of dropsByDecision(ctx, member, fromTheNewestDecided, shown)) return dropped;
  return null;
}

// The tray drop put in last: the one with the greatest `putInAt`, as Convex's descending walk of `by_member_put_in`
// found it, where a drop still waiting (no `putInAt`) sorts before every put-in one.
async function lastPutInOf(tx: Transaction, member: MemberId): Promise<{ at: number; record: DropRecord } | null> {
  const [latest] = await tx
    .select()
    .from(trayDrops)
    .where(eq(trayDrops.member, member))
    .orderBy(...indexOrder(trayDrops, ["member", "putInAt"]).orderBy("desc"))
    .limit(1);
  if (latest?.putInAt == null) return null;
  const record = await dropRecordOf(tx, member, latest.crate);
  return record === null ? null : { at: latest.putInAt, record };
}

function crestDecidedAtThePutIn(): { crest?: null } {
  return catalogue.version < firstVersionWithCrests ? {} : { crest: null };
}

function mayHaveWaitedInTheTray(crate: string) {
  return crateKindOf(crate) === "thoughtful";
}

async function cratesWaitingInTheTrayOf(tx: Transaction, member: MemberId): Promise<Set<string>> {
  const waiting = await tx
    .select({ crate: trayDrops.crate })
    .from(trayDrops)
    .where(and(eq(trayDrops.member, member), isNull(trayDrops.putInAt)));
  return new Set(waiting.map(({ crate }) => crate));
}

async function asFound(tx: Transaction, record: DropRecord, shown: CrestsShown): Promise<DropRecord> {
  if (!shown.crests || !mayHaveWaitedInTheTray(record.crate)) return record;
  const putIn = await trayDropOf(tx, record.member, record.crate);
  return putIn?.crest === undefined ? record : { ...record, crest: putIn.crest };
}

function trayDropOf(tx: Transaction, member: MemberId, crate: string): Promise<Doc<"trayDrops"> | null> {
  return uniqueOf<Doc<"trayDrops">>(tx, trayDrops, and(eq(trayDrops.member, member), eq(trayDrops.crate, crate))!, "tray drop");
}

export async function packOf(ctx: QueryContext, member: MemberId, crate: string): Promise<AppliedReward | null> {
  return (await dropRecordOf(ctx.tx, member, crate))?.pack ?? null;
}

export async function droppedIn(ctx: QueryContext, member: MemberId, crate: CrateKey): Promise<boolean> {
  return (await dropRecordOf(ctx.tx, member, crate)) !== null;
}

export async function dropOf(ctx: MutationContext, member: MemberId, crate: CrateKey): Promise<Drop | null> {
  const record = await dropRecordOf(ctx.tx, member, crate);
  if (record === null) return null;
  const crests = record.crest ? await crestsShownFor(ctx, member) : await crestsShownTo(ctx, member);
  return shownDrop(record, { crests });
}

export async function foundIn(ctx: QueryContext, member: MemberId, crate: CrateKey, shown: CrestsShown): Promise<Drop | null> {
  const record = await dropRecordOf(ctx.tx, member, crate);
  return record === null ? null : shownDrop(record, shown);
}

// The member's drops newest decided first, as Convex's descending walk of `by_member` streamed them: read a batch at a
// time, each after the last row of the one before, so a caller that stops early reads no more.
export async function* dropsByDecision(ctx: QueryContext, member: MemberId, below: DecidedBelow, shown: CrestsShown): AsyncGenerator<DroppedAt> {
  const waiting = await cratesWaitingInTheTrayOf(ctx.tx, member);
  const bounds = and(eq(drops.member, member), ...decidedWithin(below));
  let last: Doc<"drops"> | undefined;
  for (;;) {
    const rows = await ctx.tx
      .select()
      .from(drops)
      .where(last === undefined ? bounds : and(bounds, byMember.after(last, "desc")))
      .orderBy(...byMember.orderBy("desc"))
      .limit(walkBatch);
    for (const row of rows) {
      const record = toDocument<Doc<"drops">>(drops, row);
      last = record;
      if (!waiting.has(record.crate)) yield { at: record.at, n: record.n, decided: record._creationTime, drop: shownDrop(await asFound(ctx.tx, record, shown), shown) };
    }
    if (rows.length < walkBatch) return;
  }
}

function decidedWithin({ decided, inclusive, above }: DecidedBelow): SQL[] {
  return [
    ...(above === undefined ? [] : [gt(drops._creationTime, above)]),
    ...(decided === Infinity ? [] : [inclusive ? lte(drops._creationTime, decided) : lt(drops._creationTime, decided)]),
  ];
}

function shownDrop({ hoggie, rarity, copy, crest }: DropRecord, shown: CrestsShown): Drop {
  const drop: Drop = { hoggie, name: hoggieNamed(hoggie)?.name ?? hoggie, rarity, art: { kind: "hoggie", slug: hoggie }, copy, isNew: copy === 1 };
  return shown.crests ? { ...drop, crest: crest ? completedCrestOf(crest) : null } : drop;
}

export function completedCrestOf(crest: string): CompletedCrest {
  return { crest, name: crestNamed(crest)?.name ?? crest, art: { kind: "crest", slug: crest } };
}

async function crestRecordedFor(tx: Transaction, member: MemberId, hoggie: string, copy: number): Promise<{ crest?: string | null }> {
  if (catalogue.version < firstVersionWithCrests) return {};
  const team = crestWith(hoggie);
  if (copy !== 1 || team === undefined) return { crest: null };
  const others = team.roster.filter((onRoster) => onRoster !== hoggie);
  const held = await Promise.all(others.map((other) => tallyRowOf(tx, member, other)));
  return { crest: held.every((tally) => tally !== null) ? team.crest : null };
}

async function countDrop(ctx: MutationContext, member: MemberId) {
  const tally = await uniqueOf<Doc<"dropTallies">>(ctx.tx, dropTallies, eq(dropTallies.member, member), "drop tally");
  const count = (tally?.drops ?? 0) + 1;
  if (tally === null) await insert(ctx, dropTallies, { member, drops: count });
  else await ctx.tx.update(dropTallies).set({ drops: count }).where(eq(dropTallies._id, tally._id));
  return count;
}

async function nextCopyOf(tx: Transaction, member: MemberId, hoggie: string) {
  return ((await tallyRowOf(tx, member, hoggie))?.count ?? 0) + 1;
}

async function countFound(ctx: MutationContext, member: MemberId, hoggie: string, at: number, n: number) {
  const tally = await tallyRowOf(ctx.tx, member, hoggie);
  if (tally === null) {
    await insert(ctx, hoggieTallies, { member, hoggie, count: 1, firstAt: at, firstN: n });
    return 1;
  }
  await ctx.tx.update(hoggieTallies).set({ count: tally.count + 1 }).where(eq(hoggieTallies._id, tally._id));
  return tally.count + 1;
}

async function ownedBy(tx: Transaction, member: MemberId): Promise<Set<string>> {
  const tallies = await tx
    .select({ hoggie: hoggieTallies.hoggie })
    .from(hoggieTallies)
    .where(eq(hoggieTallies.member, member))
    .orderBy(...indexOrder(hoggieTallies, ["member", "hoggie"]).orderBy())
    .limit(catalogue.hoggies.length);
  return new Set(tallies.map(({ hoggie }) => hoggie));
}

export function tallyOf(ctx: QueryContext, member: MemberId, hoggie: string): Promise<Doc<"hoggieTallies"> | null> {
  return tallyRowOf(ctx.tx, member, hoggie);
}

function tallyRowOf(tx: Transaction, member: MemberId, hoggie: string): Promise<Doc<"hoggieTallies"> | null> {
  return uniqueOf<Doc<"hoggieTallies">>(tx, hoggieTallies, and(eq(hoggieTallies.member, member), eq(hoggieTallies.hoggie, hoggie))!, "hoggie tally");
}

function dropRecordOf(tx: Transaction, member: MemberId, crate: string): Promise<Doc<"drops"> | null> {
  return uniqueOf<Doc<"drops">>(tx, drops, and(eq(drops.member, member), eq(drops.crate, crate))!, "drop");
}

export function drawSecret() {
  return process.env.HOGGIE_DRAW_SECRET ?? "";
}

type HoggieTable = typeof drops | typeof dropTallies | typeof hoggieTallies | typeof trayDrops;

// Convex's `.unique()`: the one row, or null; a second one is an error, not a choice.
async function uniqueOf<Document>(tx: Transaction, table: HoggieTable, where: SQL, what: string): Promise<Document | null> {
  const rows = await tx.select().from(table).where(where).limit(2);
  if (rows.length > 1) throw new Error(`More than one ${what} is stored for a member`);
  return rows[0] === undefined ? null : toDocument<Document>(table, rows[0]);
}

async function insert(ctx: MutationContext, table: HoggieTable, document: Record<string, unknown>): Promise<void> {
  await ctx.tx.insert(table).values(fromDocument(table, { ...ctx.newRow(), ...document }) as never);
}
