// The emoji wizard: find a Slack emoji for an app emoji, map the member's own, and an admin's list of every app emoji
// with its Slack picture. Today's convex/website/emojiWizard.ts; its query and command are plain handlers the website
// platform's route table runs after the member check.
import { z } from "zod";
import { emojiLevelsOf } from "../album/levelEmojis.ts";
import { appEmojisIn, emojiInPlaceFor, mapAppEmojiInPlace, mapHeldEmoji, slackEmojisNear, type AppEmojiKind, type SlackEmojiMatch } from "../album/emojiWizard.ts";
import { targetOf } from "../album/emojiMappings.ts";
import { adminHypeEmojisShownTo, emojiWizardShownTo, ownHypePickShownTo } from "../album/flag.ts";
import type { EmojiMapper } from "../album/records.ts";
import type { HomeMember } from "../feedback/homes.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { nameAndPictureOf } from "../workspace/directory.ts";
import { slackEmojiReachOf } from "../workspace/slackEmoji.ts";
import { customEmojiPageOf } from "../workspace/url.ts";
import { workspaceSettingsShownTo } from "../workspace/workspaceSettings.ts";
import type { ShownTarget } from "./emojiMappings.ts";
import { type VerifiedMember } from "./memberQuery.ts";
import { teammateKeyOf } from "./teammateKeys.ts";

export type SlackEmojiMatches = { kind: "matches"; matches: SlackEmojiMatch[] };

export type SlackEmojiMatchesRead = { kind: "off" } | SlackEmojiMatches;

export type EmojiMappedBy = { by: EmojiMapper["as"]; name: string };

export type AppEmoji = { key: string; kind: AppEmojiKind; name: string; from: string; picture: string; holders: number; slack: { image: string; setBy: EmojiMappedBy | null } | null; place: ShownTarget };

export type AppEmojis = { kind: "app-emojis"; emojis: AppEmoji[]; more: boolean; emojiPage: string | null };

export type AppEmojisRead = { kind: "off" } | AppEmojis;

export type MyEmojiMappingAnswer = { kind: "mapped" } | { kind: "refused" };

const unnamedMapper = "A former member";

export const findSlackEmojisArgs = { near: z.string(), search: z.string() };

export async function findSlackEmojis(ctx: QueryContext, me: VerifiedMember, { near, search }: { near: string; search: string }): Promise<SlackEmojiMatchesRead> {
  if (!(await emojiWizardShownTo(ctx, me.member)) && !(await ownHypePickShownTo(ctx, me.member))) return { kind: "off" };
  return { kind: "matches", matches: await slackEmojisNear(ctx, me.workspace, near, search, await slackEmojiReachOf(ctx, me.member)) };
}

export const mapMyEmojiArgs = { emoji: z.string(), to: z.string() };

export async function mapMyEmoji(ctx: MutationContext, me: VerifiedMember, _person: HomeMember, { emoji, to }: { emoji: string; to: string }): Promise<MyEmojiMappingAnswer> {
  if (!(await emojiWizardShownTo(ctx, me.member))) return { kind: "refused" };
  return (await mapsAs(ctx, me, emoji, to)) ? { kind: "mapped" } : { kind: "refused" };
}

export const getAppEmojisArgs = {};

export async function getAppEmojis(ctx: QueryContext, me: VerifiedMember): Promise<AppEmojisRead> {
  if (!(await emojiWizardShownTo(ctx, me.member)) || !(await workspaceSettingsShownTo(ctx, me.member))) return { kind: "off" };
  const { rows, more } = await appEmojisIn(ctx, me.workspace, await emojiLevelsOf(ctx, me.member), await adminHypeEmojisShownTo(ctx, me.member));
  const emojis: AppEmoji[] = [];
  for (const { emoji, kind, name, from, picture, holders, slack } of rows) {
    const place = await shownPlaceOf(me, targetOf(emoji));
    if (place === null) continue;
    emojis.push({ key: `${place.kind}:${"person" in place ? place.person : emoji.slice(emoji.indexOf(":") + 1)}`, kind, name, from, picture, holders, place, slack: slack === null ? null : { image: slack.image, setBy: slack.mappedBy === null ? null : await mappedByOf(ctx, slack.mappedBy) } });
  }
  return { kind: "app-emojis", emojis, more, emojiPage: await customEmojiPageOf(ctx, me.workspace) };
}

async function mapsAs(ctx: MutationContext, me: VerifiedMember, emoji: string, to: string): Promise<boolean> {
  const inPlace = await emojiInPlaceFor(ctx, me.member);
  if (inPlace === "admin") return mapAppEmojiInPlace(ctx, me.workspace, me.member, emoji, to);
  return inPlace === null && (await mapHeldEmoji(ctx, me.workspace, me.member, emoji, to));
}

async function shownPlaceOf(me: VerifiedMember, target: ReturnType<typeof targetOf>): Promise<ShownTarget | null> {
  if (target === null || target.kind === "random") return null;
  return target.kind === "hype" ? { kind: "hype", person: await teammateKeyOf(me, target.person) } : target;
}

async function mappedByOf(ctx: QueryContext, { member, as }: EmojiMapper): Promise<EmojiMappedBy> {
  return { by: as, name: (await nameAndPictureOf(ctx, member)).name ?? unnamedMapper };
}
