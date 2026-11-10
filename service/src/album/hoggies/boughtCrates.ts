// Crates bought in the crate store, as today's convex/album/hoggies/boughtCrates.ts: numbered in order, paid in coins,
// bought once per number, and opened once into a drop.
import { and, eq, isNull } from "drizzle-orm";
import type { CrateBoughtEvent } from "../../bus/events.ts";
import type { Surface } from "../../commands/surface.ts";
import { toDocument } from "../../db/documents.ts";
import { indexOrder } from "../../db/indexOrder.ts";
import { boughtCrates, type Doc } from "../../db/schema/index.ts";
import type { MutationContext, QueryContext, Transaction } from "../../operations.ts";
import { coinsVisibleTo } from "../../wallet/visibility.ts";
import { spend } from "../../wallet/wallet.ts";
import { chatUserOf, type MemberId } from "../../workspace/directory.ts";
import { catalogue } from "./catalogue.ts";
import type { CrateKey } from "./crateKey.ts";
import { dropFor, dropOf, type Drop } from "./drops.ts";
import { crateStoreOpenFor, hoggiesShownTo } from "./flag.ts";
import { boughtCrateRarities } from "./rarityCaps.ts";
import type { CratePurchaseOutcome, CrateRefusal } from "./records.ts";

export type CrateStore = { price: number; next: number };

const waitingOrder = indexOrder(boughtCrates, ["member", "openedAt", "n"]);

export async function buyCrate(ctx: MutationContext, member: MemberId, next: number, at: number): Promise<CratePurchaseOutcome | null> {
  if (!(await hoggiesShownTo(ctx, member)) || !(await crateStoreOpenFor(ctx, member))) return null;
  const crate = boughtCrateKeyOf(next);
  const refused = (reason: CrateRefusal["reason"]): CrateRefusal => ({ kind: "refused", crate, reason });
  if ((await boughtCrateOf(ctx.tx, member, crate)) !== null) return { kind: "bought", crate };
  if (next !== (await boughtSoFar(ctx.tx, member)) + 1) return refused("stale");
  if (!(await coinsVisibleTo(ctx, member))) return refused("coins-not-open");
  const price = catalogue.cratePrice;
  if ((await spend(ctx, { member, coins: price, for: { crate }, at })) === "no-coins") return refused("no-coins");
  await ctx.tx.insert(boughtCrates).values({ ...ctx.newRow(), member, crate, n: next, boughtAt: at });
  const bought: CrateBoughtEvent = { type: "crateBought", workspace: (await chatUserOf(ctx, member)).workspace, member, crate, price, at };
  await ctx.publish(bought);
  return { kind: "bought", crate };
}

export async function openCrate(ctx: MutationContext, member: MemberId, crate: string, at: number, surface: Surface): Promise<void> {
  const bought = await boughtCrateOf(ctx.tx, member, crate);
  if (bought === null || bought.openedAt !== undefined || !(await hoggiesShownTo(ctx, member))) return;
  await dropFor(ctx, member, boughtCrateKeyOf(bought.n), at, { surface, rarities: boughtCrateRarities });
  await ctx.tx.update(boughtCrates).set({ openedAt: at }).where(eq(boughtCrates._id, bought._id));
}

export async function openedCrateDropOf(ctx: MutationContext, member: MemberId, crate: string): Promise<Drop | null> {
  const bought = await boughtCrateOf(ctx.tx, member, crate);
  if (bought?.openedAt === undefined || !(await hoggiesShownTo(ctx, member))) return null;
  return dropOf(ctx, member, boughtCrateKeyOf(bought.n));
}

export async function crateStoreOf(ctx: QueryContext, member: MemberId): Promise<CrateStore | null> {
  return (await coinsVisibleTo(ctx, member)) ? { price: catalogue.cratePrice, next: (await boughtSoFar(ctx.tx, member)) + 1 } : null;
}

export async function waitingCratesOf({ tx }: QueryContext, member: MemberId): Promise<string[]> {
  const waiting = await unopenedOf(tx, member);
  return waiting.map(({ crate }) => crate);
}

export type BoughtCrateWaiting = { crate: string; at: number };

export async function boughtCratesWaitingFor({ tx }: QueryContext, member: MemberId, limit: number): Promise<BoughtCrateWaiting[]> {
  const waiting = await unopenedOf(tx, member, limit);
  return waiting.map(({ crate, boughtAt }) => ({ crate, at: boughtAt }));
}

export async function boughtCrateOpened(ctx: QueryContext, member: MemberId, crate: string): Promise<boolean> {
  return (await boughtCrateOf(ctx.tx, member, crate))?.openedAt !== undefined;
}

export function boughtCrateKeyOf(next: number): CrateKey {
  return `bought:${next}`;
}

// The member's unopened crates in `by_member_opened` order: by number, as Convex walked it.
function unopenedOf(tx: Transaction, member: MemberId, limit?: number) {
  const unopened = tx
    .select({ crate: boughtCrates.crate, boughtAt: boughtCrates.boughtAt })
    .from(boughtCrates)
    .where(and(eq(boughtCrates.member, member), isNull(boughtCrates.openedAt)))
    .orderBy(...waitingOrder.orderBy());
  return limit === undefined ? unopened : unopened.limit(limit);
}

async function boughtSoFar(tx: Transaction, member: MemberId) {
  const [last] = await tx
    .select({ n: boughtCrates.n })
    .from(boughtCrates)
    .where(eq(boughtCrates.member, member))
    .orderBy(...indexOrder(boughtCrates, ["member", "n"]).orderBy("desc"))
    .limit(1);
  return last?.n ?? 0;
}

// Convex's `.unique()`: a second row for one member's crate is an error.
async function boughtCrateOf(tx: Transaction, member: MemberId, crate: string): Promise<Doc<"boughtCrates"> | null> {
  const rows = await tx
    .select()
    .from(boughtCrates)
    .where(and(eq(boughtCrates.member, member), eq(boughtCrates.crate, crate)))
    .limit(2);
  if (rows.length > 1) throw new Error("More than one bought crate is stored for a member's crate");
  return rows[0] === undefined ? null : toDocument<Doc<"boughtCrates">>(boughtCrates, rows[0]);
}
