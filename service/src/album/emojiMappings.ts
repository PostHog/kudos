// The maintainer's map of Slack emoji onto earned emojis, and a member's pick of a Slack emoji as their own hype emoji.
// Today's convex/album/emojiMappings.ts over the service's transaction.
import { companyTeamsOf } from "../companyProfiles/teams.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { personFactsOf, type MemberId } from "../workspace/directory.ts";
import { slackEmojiListedIn, slackEmojiNamed, slackEmojiReachOf, type SlackEmojiReach } from "../workspace/slackEmoji.ts";
import { milestoneTierEmojiOf, milestoneTierEmojis } from "./emojiCatalogue.ts";
import { classEmoji, classOf, emojiClassesIn, unclassEmoji } from "./emojiClasses.ts";
import { emojiNamed, freeTheName, giveEmojiTheName, namesHeldIn, openTheRegistryIn, type EarnedEmojiId } from "./emojiNames.ts";
import { isEmojiLevelOf } from "./levelEmojis.ts";
import type { EmojiMapper } from "./records.ts";

export type MappingTarget = { kind: "team"; team: string } | { kind: "milestone"; milestone: string } | { kind: "level"; level: number } | { kind: "hype"; person: MemberId } | { kind: "random" };

export type EmojiPlace = MappingTarget | { kind: "unmapped" };

export type SlackEmojiMapping = { name: string; image: string; mapping: MappingTarget | null };

export type MappableTeam = { team: string; name: string };

export type MappableMilestone = { milestone: string; name: string };

export type SlackEmojiMappings = { emoji: SlackEmojiMapping[]; more: boolean; randomDrops: boolean; teams: MappableTeam[]; milestones: MappableMilestone[]; levels: number[] };

export type OwnHypePick = { kind: "picked" } | { kind: "taken"; by: EmojiPlace["kind"] } | { kind: "refused" };

export const mostSlackEmojiListed = 10_000;

export async function slackEmojiMappingsIn(ctx: QueryContext, workspace: string, randomDrops: boolean, reach: SlackEmojiReach, levels: readonly number[]): Promise<SlackEmojiMappings> {
  const listed = await slackEmojiListedIn(ctx, workspace, mostSlackEmojiListed + 1, reach);
  const named = await namesHeldIn(ctx, workspace);
  const classes = await emojiClassesIn(ctx, workspace);
  const mappingOf = (name: string): MappingTarget | null => (classes.get(name) === "random" ? { kind: "random" } : withinLevels(targetOf(named.get(name)), levels));
  return {
    emoji: listed.slice(0, mostSlackEmojiListed).map(({ name, image }) => ({ name, image, mapping: mappingOf(name) })),
    more: listed.length > mostSlackEmojiListed,
    randomDrops,
    teams: (await companyTeamsOf(ctx)).map(({ team, name }) => ({ team, name })).toSorted((one, other) => one.name.localeCompare(other.name)),
    milestones: milestoneTierEmojis.map(({ milestone, tier, name }) => ({ milestone: `${milestone}:${tier}`, name })),
    levels: [...levels],
  };
}

function withinLevels(target: MappingTarget | null, levels: readonly number[]): MappingTarget | null {
  return target?.kind === "level" && !levels.includes(target.level) ? null : target;
}

export async function placeSlackEmoji(ctx: MutationContext, workspace: string, name: string, place: EmojiPlace, randomDrops: boolean, mapper: EmojiMapper): Promise<boolean> {
  if ((await slackEmojiNamed(ctx, workspace, name, await slackEmojiReachOf(ctx, mapper.member))) === null || (place.kind === "random" && !randomDrops)) return false;
  if (place.kind === "unmapped" || place.kind === "random") {
    await openTheRegistryIn(ctx, workspace);
    if (!(await classEmoji(ctx, workspace, name, place.kind))) return false;
    await freeTheName(ctx, workspace, name);
    return true;
  }
  const emoji = await earnedEmojiAt(ctx, workspace, place, mapper.member);
  if (emoji === null) return false;
  await openTheRegistryIn(ctx, workspace);
  await unclassEmoji(ctx, workspace, name);
  await giveEmojiTheName(ctx, workspace, emoji, name, mapper);
  return true;
}

export async function pickOwnHypeEmoji(ctx: MutationContext, workspace: string, member: MemberId, name: string): Promise<OwnHypePick> {
  if ((await slackEmojiNamed(ctx, workspace, name, await slackEmojiReachOf(ctx, member)))?.name !== name) return { kind: "refused" };
  await openTheRegistryIn(ctx, workspace);
  const held = await placeOfName(ctx, workspace, name);
  if (held?.kind === "hype" && held.person === member) return { kind: "picked" };
  if (held !== null) return { kind: "taken", by: held.kind };
  return (await placeSlackEmoji(ctx, workspace, name, { kind: "hype", person: member }, false, { member, as: "member" })) ? { kind: "picked" } : { kind: "refused" };
}

async function placeOfName(ctx: QueryContext, workspace: string, name: string): Promise<EmojiPlace | null> {
  const emojiClass = await classOf(ctx, workspace, name);
  if (emojiClass !== null) return { kind: emojiClass };
  return targetOf((await emojiNamed(ctx, workspace, name)) ?? undefined);
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

async function earnedEmojiAt(ctx: QueryContext, workspace: string, place: Exclude<MappingTarget, { kind: "random" }>, mapper: MemberId): Promise<EarnedEmojiId | null> {
  switch (place.kind) {
    case "team":
      return (await companyTeamsOf(ctx)).some(({ team }) => team === place.team) ? `team:${place.team}` : null;
    case "milestone":
      return milestoneTierEmojiOf(place.milestone) === null ? null : (`milestone:${place.milestone}` as EarnedEmojiId);
    case "level":
      return (await isEmojiLevelOf(ctx, mapper, place.level)) ? `level:${place.level}` : null;
    case "hype":
      return (await personFactsOf(ctx, place.person))?.workspace === workspace ? `hype:${place.person}` : null;
  }
}
