// The module map's skeleton of convex/wallet/wallet.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { ReportableError } from "../analytics/exceptions.ts";
import { perkValidator } from "../progression/tree.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const spentForValidator = z.union([z.strictObject({ perk: perkValidator }), z.strictObject({ item: z.string() }), z.strictObject({ crate: z.string() })]);

export const coinSpendValidator = z.strictObject({ member: zv.id("members"), coins: zv.number(), for: spentForValidator, at: zv.number() });

export type CoinSpend = z.infer<typeof coinSpendValidator>;

export type Spent = "spent" | "no-coins";

export type Wallet = { balance: number };

export async function visibleWalletOf(ctx: QueryContext, member: MemberId): Promise<Wallet | null> {
  throw notPorted("wallet.wallet.visibleWalletOf");
}

export async function balanceOf(ctx: QueryContext, member: MemberId): Promise<number> {
  throw notPorted("wallet.wallet.balanceOf");
}

export async function credit(ctx: MutationContext, member: MemberId, coins: number): Promise<void> {
  throw notPorted("wallet.wallet.credit");
}

export async function spend(ctx: MutationContext, spending: CoinSpend): Promise<Spent> {
  throw notPorted("wallet.wallet.spend");
}

export function wholeCoins(coins: number) {
  if (!Number.isInteger(coins) || coins < 0) throw new ReportableError("not a whole number of coins");
  return coins;
}
