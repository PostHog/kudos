// The website's buy commands: today's buyPerk, buyItem and buyCrate in convex/website/commands.ts, as command handlers
// `(ctx, me, person, args)` that S17's route list registers as `website.commands.<function>`. A buy runs through the
// shared command runner, whose idempotency key makes a double click one purchase: a perk or an item is keyed by the
// purchase's request, a UUID the page makes once per click, and a crate by the store's next crate. The coins and skill
// points it spends are the wallet's and progression's to guard; this module adds no guard of its own.
import { z } from "zod";
import { crateStoreOf } from "../album/hoggies/boughtCrates.ts";
import { runCommand, type Command } from "../commands/commands.ts";
import { republish, type HomeMember } from "../feedback/homes.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { Refusal } from "../progression/purchases.ts";
import { perkValidator, type PerkId } from "../progression/tree.ts";
import { storeVisibleTo } from "../store/visibility.ts";
import type { CratePurchaseAnswer, ItemPurchaseAnswer, PurchaseAnswer, PurchaseRefusal } from "./commands.ts";
import { noLaunchWaitsFor } from "./flag.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { featurePageOf, unlockPathOf } from "./unlockPath.ts";

function runFromWebsite(ctx: MutationContext, me: VerifiedMember, person: HomeMember, command: Command, idempotencyKey: string) {
  return runCommand(ctx, me.workspace, person, command, { surface: "website", idempotencyKey });
}

const refusedAtTheGate: PurchaseAnswer = { kind: "refused", reason: null };

const purchaseRefusals: Record<Refusal, PurchaseRefusal | null> = {
  owned: "owned",
  "below-row": "level",
  "needs-prerequisite": "requires",
  "no-skill-points": "points",
  "tree-locked": "not-open",
  "tree-ready": "not-open",
  retired: null,
  "coins-not-open": "coins-not-open",
  "no-coins": "coins",
};

export const buyPerkArgs = { perk: perkValidator, request: z.string() };

export async function buyPerk(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { perk, request }: { perk: PerkId; request: string }): Promise<PurchaseAnswer> {
  if (!isUuid(request)) throw new Error("A purchase's request must be a UUID.");
  if (!(await treeOpenWithEveryLaunchRecorded(queryOnly(ctx), me))) return refusedAtTheGate;
  const outcome = await runFromWebsite(ctx, me, person, { type: "buyPerk", perk }, `website:${me.member}:${request}`);
  if (outcome === null || !("perk" in outcome)) return refusedAtTheGate;
  if (outcome.kind === "refused") return { kind: "refused", reason: purchaseRefusals[outcome.reason] };
  await republish(ctx, me.member);
  return { kind: "bought" };
}

const longestItemId = 128;

const itemRefusedAtTheGate: ItemPurchaseAnswer = { kind: "refused", reason: null };

export const buyItemArgs = { item: z.string(), request: z.string() };

export async function buyItem(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { item, request }: { item: string; request: string }): Promise<ItemPurchaseAnswer> {
  if (!isUuid(request)) throw new Error("A purchase's request must be a UUID.");
  if (item.length > longestItemId) throw new Error("A purchase's item is longer than any item ID.");
  if (!(await storeOpenWithEveryLaunchRecorded(queryOnly(ctx), me))) return itemRefusedAtTheGate;
  const outcome = await runFromWebsite(ctx, me, person, { type: "buyItem", item }, `website:${me.member}:${request}`);
  if (outcome === null || !("item" in outcome)) return itemRefusedAtTheGate;
  if (outcome.kind === "refused") return { kind: "refused", reason: outcome.reason };
  await republish(ctx, me.member);
  return { kind: "bought", item: outcome.item };
}

export const buyCrateArgs = { next: z.number() };

export async function buyCrate(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { next }: { next: number }): Promise<CratePurchaseAnswer> {
  if (!(await noLaunchWaitsFor(ctx, me))) return null;
  const before = await crateStoreOf(ctx, me.member);
  const outcome = await runFromWebsite(ctx, me, person, { type: "buyCrate", next }, `website:buyCrate:${me.member}:${next}`);
  if (outcome === null || !("crate" in outcome)) return null;
  if (outcome.kind === "refused") return { kind: "refused", reason: outcome.reason };
  if ((await crateStoreOf(ctx, me.member))?.next !== before?.next) await republish(ctx, me.member);
  return { kind: "bought", crate: outcome.crate };
}

// The guards read as today's did, through a read-only context: a flag read there writes no analytics ID or workspace
// key, so a purchase refused at the gate writes nothing at all.
function queryOnly({ tx, now }: MutationContext): QueryContext {
  return { tx, now };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(request: string) {
  return uuid.test(request);
}

async function treeOpenWithEveryLaunchRecorded(ctx: QueryContext, me: VerifiedMember) {
  return featurePageOf(await unlockPathOf(ctx, me), "skillTree").kind === "open" && (await noLaunchWaitsFor(ctx, me));
}

async function storeOpenWithEveryLaunchRecorded(ctx: QueryContext, me: VerifiedMember) {
  return (await storeVisibleTo(ctx, me.member)) && (await noLaunchWaitsFor(ctx, me));
}
