// The module map's skeleton of convex/album/emojiNames.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { companyTeamsReplacedEventValidator } from "../bus/events.ts";
import type { MemberId } from "../workspace/directory.ts";
import { slugOf } from "./emojiCatalogue.ts";
import type { EmojiMapper, MilestoneId, MilestoneTier } from "./records.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type EarnedEmojiId = `level:${number}` | `milestone:${MilestoneId}:${MilestoneTier}` | `team:${string}` | `hype:${MemberId}`;

const hypeSuffix = "-hype";
const teamStem = "team";

export async function emojiNameOf(ctx: QueryContext, workspace: string, emoji: EarnedEmojiId): Promise<string | null> {
  throw notPorted("album.emojiNames.emojiNameOf");
}

export async function nameHypeEmojiOf(ctx: MutationContext, workspace: string, person: MemberId): Promise<void> {
  throw notPorted("album.emojiNames.nameHypeEmojiOf");
}

export function firstHypeEmojiNameFor(fullName: string): string {
  return firstCandidateOf(hypeNameShapeOf(fullName));
}

export function hypeNameHintsIn(ctx: QueryContext, workspace: string): (fullName: string) => Promise<string> {
  throw notPorted("album.emojiNames.hypeNameHintsIn");
}

function hypeNameShapeOf(fullName: string): NameShape {
  return { slug: slugOf(fullName), empty: "person", suffix: hypeSuffix };
}

export async function teamEmojiNameOf(ctx: MutationContext, workspace: string, team: string): Promise<string> {
  throw notPorted("album.emojiNames.teamEmojiNameOf");
}

export async function namesHeldIn(ctx: QueryContext, workspace: string): Promise<Map<string, EarnedEmojiId>> {
  throw notPorted("album.emojiNames.namesHeldIn");
}

export async function openTheRegistryIn(ctx: MutationContext, workspace: string): Promise<void> {
  throw notPorted("album.emojiNames.openTheRegistryIn");
}

export async function giveEmojiTheName(ctx: MutationContext, workspace: string, emoji: EarnedEmojiId, name: string, mappedBy: EmojiMapper): Promise<void> {
  throw notPorted("album.emojiNames.giveEmojiTheName");
}

export async function freeTheName(ctx: MutationContext, workspace: string, name: string): Promise<void> {
  throw notPorted("album.emojiNames.freeTheName");
}

export type RegisteredEmoji = { emoji: EarnedEmojiId; name: string; mappedBy: EmojiMapper | null };

export async function registeredEmojisIn(ctx: QueryContext, workspace: string): Promise<RegisteredEmoji[]> {
  throw notPorted("album.emojiNames.registeredEmojisIn");
}

export async function emojiNamed(ctx: QueryContext, workspace: string, name: string): Promise<EarnedEmojiId | null> {
  throw notPorted("album.emojiNames.emojiNamed");
}

export async function mapperOf(ctx: QueryContext, workspace: string, emoji: EarnedEmojiId): Promise<EmojiMapper | null> {
  throw notPorted("album.emojiNames.mapperOf");
}

export const reserveTeamNamesAfterTheSyncArgs = z.strictObject({ event: companyTeamsReplacedEventValidator });
export async function reserveTeamNamesAfterTheSync(ctx: MutationContext, args: z.infer<typeof reserveTeamNamesAfterTheSyncArgs>): Promise<null> {
  throw notPorted("album.emojiNames.reserveTeamNamesAfterTheSync");
}
export const reserveTeamNamesAfterTheSyncJob = mutationJob("album.emojiNames.reserveTeamNamesAfterTheSync", reserveTeamNamesAfterTheSyncArgs, reserveTeamNamesAfterTheSync);

type NameShape = { slug: string; empty: string; suffix: string };

export function teamPrefixed(slug: string): string {
  return `${teamStem}-${slug}`;
}

function firstCandidateOf({ slug, empty, suffix }: NameShape): string {
  return slug === "" ? `${empty}-1${suffix}` : `${slug}${suffix}`;
}
