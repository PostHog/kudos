// The module map's skeleton of convex/album/packs.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { kudosGivenEventValidator } from "../bus/events.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { CrateKey } from "./hoggies/crateKey.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const recipientsPerMutation = 50;
export const mostWaitingPacksShown = 50;

export type WaitingPack = { pack: Id<"thoughtfulPacks">; person: MemberId; earnedAt: number };

export type Instants = { from: number; to: number };

export type GrantedKudos = { message: MessageRef; at: number; recipients: number };

type PackId = Id<"thoughtfulPacks">;

export const grantThoughtfulPacksArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
export async function grantThoughtfulPacks(ctx: MutationContext, args: z.infer<typeof grantThoughtfulPacksArgs>): Promise<null> {
  throw notPorted("album.packs.grantThoughtfulPacks");
}
export const grantThoughtfulPacksJob = mutationJob("album.packs.grantThoughtfulPacks", grantThoughtfulPacksArgs, grantThoughtfulPacks);

export async function waitingPacksOf(ctx: QueryContext, member: MemberId): Promise<{ packs: WaitingPack[]; more: boolean }> {
  throw notPorted("album.packs.waitingPacksOf");
}

export async function grantedKudosBetween(ctx: QueryContext, workspace: string, { from, to }: Instants, most: number): Promise<GrantedKudos[]> {
  throw notPorted("album.packs.grantedKudosBetween");
}

export async function packsEarnedBetween(ctx: QueryContext, giver: MemberId, { from, to }: Instants, most: number): Promise<Doc<"thoughtfulPacks">[]> {
  throw notPorted("album.packs.packsEarnedBetween");
}

export async function isFirstPackFor(ctx: QueryContext, { _id, giver, recipient }: Doc<"thoughtfulPacks">): Promise<boolean> {
  throw notPorted("album.packs.isFirstPackFor");
}

export async function isFirstPackGrantedFor(ctx: QueryContext, giver: MemberId, recipient: MemberId, message: MessageRef): Promise<boolean> {
  throw notPorted("album.packs.isFirstPackGrantedFor");
}

export function firstPackGrantedFor(ctx: QueryContext, giver: MemberId, recipient: MemberId): Promise<Doc<"thoughtfulPacks"> | null> {
  throw notPorted("album.packs.firstPackGrantedFor");
}

type Thanks = { workspace: string; giver: MemberId; recipient: MemberId; message: MessageRef; at: number };

export async function earnItemsOfAPackGivenBeforeTheLedger(ctx: MutationContext, pack: Doc<"thoughtfulPacks">): Promise<void> {
  throw notPorted("album.packs.earnItemsOfAPackGivenBeforeTheLedger");
}

export function thanksEarningOf({ workspace, giver, recipient, message, at }: Thanks) {
  return { workspace, member: giver, reason: { kind: "thanks" as const, person: recipient, message }, earnedAt: at };
}

export const thoughtfulCratePrefix = "thoughtful:";

export function crateKeyOf(pack: PackId): CrateKey {
  return `${thoughtfulCratePrefix}${pack}`;
}
