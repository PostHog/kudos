// The module map's skeleton of convex/album/emojiMappings.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import { type SlackEmojiReach } from "../workspace/slackEmoji.ts";
import { type EarnedEmojiId } from "./emojiNames.ts";
import type { EmojiMapper } from "./records.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type MappingTarget = { kind: "team"; team: string } | { kind: "milestone"; milestone: string } | { kind: "level"; level: number } | { kind: "hype"; person: MemberId } | { kind: "random" };

export type EmojiPlace = MappingTarget | { kind: "unmapped" };

export type SlackEmojiMapping = { name: string; image: string; mapping: MappingTarget | null };

export type MappableTeam = { team: string; name: string };

export type MappableMilestone = { milestone: string; name: string };

export type SlackEmojiMappings = { emoji: SlackEmojiMapping[]; more: boolean; randomDrops: boolean; teams: MappableTeam[]; milestones: MappableMilestone[]; levels: number[] };

export type OwnHypePick = { kind: "picked" } | { kind: "taken"; by: EmojiPlace["kind"] } | { kind: "refused" };

export const mostSlackEmojiListed = 10_000;

export async function slackEmojiMappingsIn(ctx: QueryContext, workspace: string, randomDrops: boolean, reach: SlackEmojiReach, levels: readonly number[]): Promise<SlackEmojiMappings> {
  throw notPorted("album.emojiMappings.slackEmojiMappingsIn");
}

export async function placeSlackEmoji(ctx: MutationContext, workspace: string, name: string, place: EmojiPlace, randomDrops: boolean, mapper: EmojiMapper): Promise<boolean> {
  throw notPorted("album.emojiMappings.placeSlackEmoji");
}

export async function pickOwnHypeEmoji(ctx: MutationContext, workspace: string, member: MemberId, name: string): Promise<OwnHypePick> {
  throw notPorted("album.emojiMappings.pickOwnHypeEmoji");
}

export function targetOf(emoji: EarnedEmojiId | undefined): MappingTarget | null {
  if (emoji === undefined) return null;
  const colon = emoji.indexOf(":");
  const [kind, cause] = [emoji.slice(0, colon), emoji.slice(colon + 1)];
  if (kind === "team") return { kind, team: cause };
  if (kind === "milestone") return { kind, milestone: cause };
  if (kind === "level") return { kind, level: Number(cause) };
  return { kind: "hype", person: cause as MemberId };
}
