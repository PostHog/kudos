import type { MutationCtx, QueryCtx } from "../_generated/server";
import { storedCompanyFaceOf } from "../companyProfiles/storedFaces";
import { companyTeamsOf, type TeamCrestArt } from "../companyProfiles/teams";
import { xpToReach } from "../progression/levels";
import { progressionHomeOf } from "../progression/progression";
import { levelFirstReachedAt } from "../unlocks/levelUps";
import { nameAndPictureOf, personFactsOf, type MemberId } from "../workspace/directory";
import { slackEmojiImageOf, withoutSkinTone } from "../workspace/slackEmoji";
import { emojiArtPictureOf, hypeEmblemPicture, milestoneTierArtOf, milestoneTierEmojiOf, milestoneTierEmojis, teamEmblemPicture } from "./emojiCatalogue";
import { emojiNamed, emojiNameOf, namesHeldIn, registeredEmojisIn, type EarnedEmojiId } from "./emojiNames";
import { emojiLevelsOf, isEmojiLevelOf, levelEmojiPictureOf } from "./levelEmojis";
import type { MilestoneAnswer, ReachedTier } from "./milestones";
import { isFirstPackFor, packsEarnedBetween, type Instants } from "./packs";
import type { MilestoneId, MilestoneTier, TeamSticker } from "./records";
import { randomEmojisShownTo } from "./flag";
import { holdsRandomEmoji, randomEmojiNamesHeldBy, randomEmojisHeldBy, type RandomEmojiId } from "./randomEmojis";
import type { PageOwner, TeamPage } from "./teamPages";
import { collectedBy, peopleCollectedBy } from "./hypeCollections";
import { holdsTheHypeOf, hypesHeldFor, hypeWaitsForItsItem, type HypesHeld } from "./items/hypes";
import { boardOf } from "./items/ledger";
import { hiddenItemsShownTo } from "./items/flag";

export type EarnedEmojiKind = "team" | "milestone" | "level" | "hype" | "random";

export type EmojiProgress = { have: number; need: number };

export type EarnedEmoji = { id: EarnedEmojiId | RandomEmojiId; kind: EarnedEmojiKind; name: string; from: string; picture: string; earned: boolean; earnedAt: number | null; seen: boolean; inSlack: boolean; progress: EmojiProgress | null; byReactions?: true };

export type SharedEmoji = Pick<EarnedEmoji, "id" | "kind" | "name" | "from" | "picture" | "inSlack">;

export type EmojiCauses = { pages: TeamPage[]; milestones: MilestoneAnswer[]; level: { level: number; xp: number }; hypesHeld?: HypesHeld; picked?: string[] };

export type EarnedEmojis = { emojis: EarnedEmoji[]; more: boolean };

export type ShownEmoji = Pick<EarnedEmoji, "name" | "picture" | "inSlack">;

export type HypeEmoji = ShownEmoji;

export const mostHypeEmojisShown = 200;

export const mostPeoplePackedRead = 500;

export const mostEmojisSeenAtOnce = 500;

export const mostEmojiCausesRead = 500;

const mostEmojiNamesLookedUpOneByOne = 50;

const unnamedPerson = "A teammate";

const hypePrefix = "hype:";

type Cause = { id: EarnedEmojiId; kind: EarnedEmojiKind; from: string; picture: string; earned: boolean; earnedAt: number | null; progress: EmojiProgress; byReactions?: true };

type PackedPerson = { person: MemberId; unlockedAt: number; collected: boolean };

type EarnedCause = Pick<Cause, "id" | "picture">;

export async function earnedEmojisOf(ctx: QueryCtx, owner: PageOwner, causes: EmojiCauses): Promise<EarnedEmojis> {
  const seen = await seenBy(ctx, owner.member);
  const hype = await hypeCausesOf(ctx, owner, seen, causes);
  const emojis: EarnedEmoji[] = [];
  for (const cause of [...teamCausesOf(causes.pages), ...hype.causes, ...milestoneCausesOf(causes.milestones), ...levelCausesOf(causes.level, await emojiLevelsOf(ctx, owner.member))]) {
    const name = await emojiNameOf(ctx, owner.workspace, cause.id);
    if (name !== null) emojis.push(await emojiOf(ctx, owner.workspace, cause, name, seen));
  }
  for (const { id, name, image, from, at } of await randomEmojisHeldBy(ctx, owner.workspace, owner.member, causes.picked)) emojis.push({ id, kind: "random", name, from: await nameOrUnnamed(ctx, from), picture: image, earned: true, earnedAt: at, seen: seen.has(id), inSlack: true, progress: null });
  return { emojis, more: hype.more };
}

export type EmojiStack = { count: number; shown: ShownEmoji[] };

export async function earnedEmojiCountOf(ctx: QueryCtx, workspace: string, member: MemberId): Promise<number> {
  return (await emojiStackOf(ctx, workspace, member, 0)).count;
}

export async function emojiStackOf(ctx: QueryCtx, workspace: string, member: MemberId, most: number): Promise<EmojiStack> {
  const turned = await turnedOf(ctx, member);
  const names = new Map((await registeredEmojisIn(ctx, workspace)).map(({ emoji, name }) => [emoji as string, name]));
  const earned = [...(await teamsUnlockedBy(ctx, member)), ...(await hypesShownEarnedBy(ctx, { workspace, member }, turned)), ...(await tierEmojisTurnedBy(ctx, member, turned)), ...(await levelEmojisReachedBy(ctx, member))].filter(({ id }) => names.has(id));
  const drops = await randomEmojisHeldBy(ctx, workspace, member);
  const shown: ShownEmoji[] = [];
  for (const { id, picture } of earned.slice(0, most)) shown.push(await shownEmojiOf(ctx, workspace, await picture(), names.get(id)!));
  for (const { name, image } of drops.slice(0, most - shown.length)) shown.push({ name, picture: image, inSlack: true });
  return { count: earned.length + drops.length, shown };
}

type CountedEmoji = { id: string; picture: () => Promise<string> };

const allTime: Instants = { from: -Infinity, to: Infinity };

type Turned = { seen: Set<string>; held: HypesHeld | undefined };

async function turnedOf(ctx: QueryCtx, member: MemberId): Promise<Turned> {
  const seen = await seenBy(ctx, member);
  return { seen, held: (await hiddenItemsShownTo(ctx, member)) ? hypesHeldFor(await boardOf(ctx, member)) : undefined };
}

async function hypesShownEarnedBy(ctx: QueryCtx, { workspace, member }: PageOwner, { seen, held }: Turned): Promise<CountedEmoji[]> {
  const shown = unseenFirst(await peopleWithHypeOf(ctx, member, mostPeoplePackedRead), seen).slice(0, mostHypeEmojisShown);
  return shown.filter((packed) => !isHeldForItsItem(packed, seen, held)).map(({ person }) => ({ id: `hype:${person}`, picture: async () => (await hypeFaceOf(ctx, workspace, person)).picture }));
}

async function tierEmojisTurnedBy(ctx: QueryCtx, member: MemberId, { seen, held }: Turned): Promise<CountedEmoji[]> {
  const reached = await tiersReachedBetween(ctx, member, allTime);
  return (held === undefined ? reached : reached.filter(({ id }) => seen.has(id))).map(countedNow);
}

async function levelEmojisReachedBy(ctx: QueryCtx, member: MemberId): Promise<CountedEmoji[]> {
  const { level } = await progressionHomeOf(ctx, member);
  return (await emojiLevelsOf(ctx, member)).filter((reward) => level >= reward).map((reward) => countedNow({ id: `level:${reward}`, picture: levelEmojiPictureOf(reward) }));
}

async function teamsUnlockedBy(ctx: QueryCtx, member: MemberId): Promise<CountedEmoji[]> {
  return (await teamsUnlockedBetween(ctx, member, allTime)).map(countedNow);
}

function countedNow({ id, picture }: EarnedCause): CountedEmoji {
  return { id, picture: () => Promise.resolve(picture) };
}

export async function sharedEmojisOf(ctx: QueryCtx, member: MemberId, { emojis }: EarnedEmojis): Promise<SharedEmoji[] | null> {
  if (!(await personFactsOf(ctx, member))?.admin) return null;
  const companyTeams = new Set((await companyTeamsOf(ctx)).map(({ team }) => `team:${team}`));
  return emojis.filter(({ id, kind }) => (kind === "team" ? companyTeams.has(id) : kind === "milestone" || kind === "level")).map(({ id, kind, name, from, picture, inSlack }) => ({ id, kind, name, from, picture, inSlack }));
}

export async function hypeEmojiOf(ctx: QueryCtx, workspace: string, person: MemberId): Promise<HypeEmoji | null> {
  const name = await emojiNameOf(ctx, workspace, `hype:${person}`);
  if (name === null) return null;
  const slackPicture = await slackEmojiImageOf(ctx, workspace, name);
  return { name, picture: slackPicture ?? (await hypeFaceOf(ctx, workspace, person)).picture, inSlack: slackPicture !== undefined };
}

export async function emojisEarnedBetween(ctx: QueryCtx, { workspace, member }: PageOwner, instants: Instants): Promise<ShownEmoji[]> {
  const earned: ShownEmoji[] = [];
  for (const { id, picture } of await causesEarnedBetween(ctx, { workspace, member }, instants)) {
    const name = await emojiNameOf(ctx, workspace, id);
    if (name !== null) earned.push(await shownEmojiOf(ctx, workspace, picture, name));
  }
  const dropped = (await randomEmojisHeldBy(ctx, workspace, member)).filter(({ at }) => isWithin(instants, at));
  return [...earned, ...dropped.map(({ name, image }) => ({ name, picture: image, inSlack: true }))];
}

export type LevelsReached = { above: number; upTo: number; at: number };

export async function levelEmojisEarnedIn(ctx: QueryCtx, { workspace, member }: PageOwner, { above, upTo, at }: LevelsReached): Promise<EarnedEmoji[]> {
  const emojis: EarnedEmoji[] = [];
  for (const reward of (await emojiLevelsOf(ctx, member)).filter((level) => level > above && level <= upTo)) {
    const cause = levelReachedCauseOf(reward, at);
    const name = await emojiNameOf(ctx, workspace, cause.id);
    if (name !== null) emojis.push(await emojiOf(ctx, workspace, cause, name, await seenAmong(ctx, member, cause.id)));
  }
  return emojis;
}

function levelReachedCauseOf(reward: number, at: number): Cause {
  return { id: `level:${reward}`, kind: "level", from: `Level ${reward}`, picture: levelEmojiPictureOf(reward), earned: true, earnedAt: at, progress: { have: reward, need: reward } };
}

async function seenAmong(ctx: QueryCtx, member: MemberId, emoji: string): Promise<Set<string>> {
  return new Set((await seenAtOf(ctx, member, emoji)) === null ? [] : [emoji]);
}

export async function seenAtOf(ctx: QueryCtx, member: MemberId, emoji: string): Promise<number | null> {
  const seen = await ctx.db
    .query("seenEmojis")
    .withIndex("by_member_emoji", (q) => q.eq("member", member).eq("emoji", emoji))
    .first();
  return seen?.at ?? null;
}

export async function teamEmojiOf(ctx: QueryCtx, workspace: string, { team, art }: Pick<TeamSticker, "team" | "art">): Promise<ShownEmoji | null> {
  const name = await emojiNameOf(ctx, workspace, `team:${team}`);
  return name === null ? null : shownEmojiOf(ctx, workspace, teamPictureOf(art), name);
}

export async function levelEmojiOf(ctx: QueryCtx, workspace: string, level: number): Promise<ShownEmoji | null> {
  const name = await emojiNameOf(ctx, workspace, `level:${level}`);
  return name === null ? null : shownEmojiOf(ctx, workspace, levelEmojiPictureOf(level), name);
}

export async function markEmojisSeenBy(ctx: MutationCtx, member: MemberId, ids: string[], at: number): Promise<string[] | null> {
  if (ids.length > mostEmojisSeenAtOnce) return null;
  const seen = await seenBy(ctx, member);
  const marked: string[] = [];
  for (const id of new Set(ids)) {
    if (!(await isEarnedBy(ctx, member, id))) continue;
    if (!seen.has(id)) await ctx.db.insert("seenEmojis", { member, emoji: id, at });
    marked.push(id);
  }
  return marked;
}

export async function unlockHypeEmojiOf(ctx: MutationCtx, { workspace, member }: PageOwner, person: MemberId, at: number): Promise<HypeEmoji | null> {
  return (await markEmojiSeen(ctx, member, `hype:${person}`, at)) ? hypeEmojiOf(ctx, workspace, person) : null;
}

export async function markEmojiSeen(ctx: MutationCtx, member: MemberId, emoji: string, at: number): Promise<boolean> {
  if ((await seenAmong(ctx, member, emoji)).size > 0) return false;
  await ctx.db.insert("seenEmojis", { member, emoji, at });
  return true;
}

async function emojiOf(ctx: QueryCtx, workspace: string, { id, kind, from, picture, earned, earnedAt, progress, byReactions }: Cause, name: string, seen: Set<string>): Promise<EarnedEmoji> {
  return { id, kind, from, ...(await shownEmojiOf(ctx, workspace, picture, name)), earned, earnedAt, seen: earned && seen.has(id), progress: earned ? null : progress, ...(byReactions && { byReactions }) };
}

async function shownEmojiOf(ctx: QueryCtx, workspace: string, picture: string, name: string): Promise<ShownEmoji> {
  const slackPicture = await slackEmojiImageOf(ctx, workspace, name);
  return { name, picture: slackPicture ?? picture, inSlack: slackPicture !== undefined };
}

async function causesEarnedBetween(ctx: QueryCtx, owner: PageOwner, instants: Instants): Promise<EarnedCause[]> {
  return [...(await teamsUnlockedBetween(ctx, owner.member, instants)), ...(await hypesEarnedBetween(ctx, owner, instants)), ...(await tiersUnlockedBetween(ctx, owner.member, instants)), ...(await levelsReachedBetween(ctx, owner.member, instants))];
}

async function teamsUnlockedBetween(ctx: QueryCtx, member: MemberId, instants: Instants): Promise<EarnedCause[]> {
  const stickers = await ctx.db
    .query("teamStickers")
    .withIndex("by_member_team", (q) => q.eq("member", member))
    .take(mostEmojiCausesRead);
  return stickers.filter(({ at }) => isWithin(instants, at)).map(({ team, art }) => ({ id: `team:${team}`, picture: teamPictureOf(art) }));
}

async function hypesEarnedBetween(ctx: QueryCtx, { workspace, member }: PageOwner, instants: Instants): Promise<EarnedCause[]> {
  const causes: EarnedCause[] = [];
  for (const person of await peopleWhoseHypeKudosUnlockedBetween(ctx, member, instants)) {
    if ((await collectedBy(ctx, member, person)) === null) causes.push(await hypeCauseOf(ctx, workspace, person));
  }
  for (const { person, at } of await peopleCollectedBy(ctx, member, mostPeoplePackedRead)) {
    if (isWithin(instants, at)) causes.push(await hypeCauseOf(ctx, workspace, person));
  }
  return causes;
}

async function peopleWhoseHypeKudosUnlockedBetween(ctx: QueryCtx, member: MemberId, instants: Instants): Promise<MemberId[]> {
  return (await hiddenItemsShownTo(ctx, member)) ? peopleWhoseHypeTurnedBetween(ctx, member, instants) : peopleFirstPackedBetween(ctx, member, instants);
}

async function peopleFirstPackedBetween(ctx: QueryCtx, member: MemberId, instants: Instants): Promise<MemberId[]> {
  const people: MemberId[] = [];
  for (const pack of await packsEarnedBetween(ctx, member, instants, mostPeoplePackedRead)) if (await isFirstPackFor(ctx, pack)) people.push(pack.recipient);
  return people;
}

async function peopleWhoseHypeTurnedBetween(ctx: QueryCtx, member: MemberId, { from, to }: Instants): Promise<MemberId[]> {
  const people: MemberId[] = [];
  const seenThen = ctx.db.query("seenEmojis").withIndex("by_member_at", (q) => q.eq("member", member).gte("at", from).lt("at", to));
  for await (const { emoji } of seenThen) {
    const person = emoji.startsWith(hypePrefix) ? ctx.db.normalizeId("members", emoji.slice(hypePrefix.length)) : null;
    if (person !== null && (await hasPackedFor(ctx, member, person))) people.push(person);
    if (people.length === mostPeoplePackedRead) break;
  }
  return people;
}

async function hypeCauseOf(ctx: QueryCtx, workspace: string, person: MemberId): Promise<EarnedCause> {
  return { id: `hype:${person}`, picture: (await hypeFaceOf(ctx, workspace, person)).picture };
}

async function tiersReachedBetween(ctx: QueryCtx, member: MemberId, instants: Instants): Promise<EarnedCause[]> {
  const tiers = await milestoneTiersOf(ctx, member);
  return tierCausesAmong(new Set(tiers.filter(({ at }) => isWithin(instants, at)).map(tierEmojiIdOf)));
}

async function tiersUnlockedBetween(ctx: QueryCtx, member: MemberId, instants: Instants): Promise<EarnedCause[]> {
  const heldForTheirTurn = await hiddenItemsShownTo(ctx, member);
  const unlocked = new Set<EarnedEmojiId>();
  for (const tier of await milestoneTiersOf(ctx, member)) {
    const unlockedAt = heldForTheirTurn ? await tierUnlockedAt(ctx, member, tier, tier.at) : tier.at;
    if (unlockedAt !== null && isWithin(instants, unlockedAt)) unlocked.add(tierEmojiIdOf(tier));
  }
  return tierCausesAmong(unlocked);
}

export async function tierUnlockedAt(ctx: QueryCtx, member: MemberId, tier: ReachedTier, reachedAt: number): Promise<number | null> {
  const seenAt = await seenAtOf(ctx, member, tierEmojiIdOf(tier));
  return seenAt === null ? null : Math.max(reachedAt, seenAt);
}

function milestoneTiersOf(ctx: QueryCtx, member: MemberId) {
  return ctx.db
    .query("milestoneTiers")
    .withIndex("by_member_milestone_tier", (q) => q.eq("member", member))
    .take(mostEmojiCausesRead);
}

function tierCausesAmong(ids: Set<EarnedEmojiId>): EarnedCause[] {
  return milestoneTierEmojis
    .filter((tier) => ids.has(tierEmojiIdOf(tier)))
    .map(({ milestone, tier }) => ({ id: tierEmojiIdOf({ milestone, tier }), picture: emojiArtPictureOf("milestone", milestoneTierArtOf(milestone, tier)) }));
}

export function tierEmojiIdOf({ milestone, tier }: ReachedTier): EarnedEmojiId {
  return `milestone:${milestone}:${tier}`;
}

async function levelsReachedBetween(ctx: QueryCtx, member: MemberId, instants: Instants): Promise<EarnedCause[]> {
  const causes: EarnedCause[] = [];
  for (const level of await emojiLevelsOf(ctx, member)) {
    const at = await levelFirstReachedAt(ctx, member, level);
    if (at !== null && isWithin(instants, at)) causes.push({ id: `level:${level}`, picture: levelEmojiPictureOf(level) });
  }
  return causes;
}

function isWithin({ from, to }: Instants, at: number) {
  return at >= from && at < to;
}

function teamCausesOf(pages: TeamPage[]): Cause[] {
  return pages.map(({ team, name, art, state, held, total, unlockedAt }) => ({ id: `team:${team}`, kind: "team", from: name, picture: teamPictureOf(art), earned: state === "unlocked", earnedAt: unlockedAt, progress: { have: held, need: total } }));
}

export function teamPictureOf(art: TeamCrestArt): string {
  if (art === null) return teamEmblemPicture;
  return art.kind === "crest" ? emojiArtPictureOf("team", art.slug) : art.url;
}

function milestoneCausesOf(milestones: MilestoneAnswer[]): Cause[] {
  return milestones.flatMap(({ id, count, tiers }) =>
    tiers.map(({ tier, at, name, earnedAt }) => ({ id: `milestone:${id}:${tier}` as const, kind: "milestone" as const, from: name, picture: emojiArtPictureOf("milestone", milestoneTierArtOf(id, tier)), earned: earnedAt !== null, earnedAt, progress: { have: count, need: at } })),
  );
}

function levelCausesOf({ level, xp }: EmojiCauses["level"], levels: readonly number[]): Cause[] {
  return levels.map((reward) => ({ id: `level:${reward}`, kind: "level", from: `Level ${reward}`, picture: levelEmojiPictureOf(reward), earned: level >= reward, earnedAt: null, progress: { have: xp, need: xpToReach(reward) } }));
}

async function hypeCausesOf(ctx: QueryCtx, { workspace, member }: PageOwner, seen: Set<string>, { hypesHeld: held }: EmojiCauses): Promise<{ causes: Cause[]; more: boolean }> {
  const people = unseenFirst(await peopleWithHypeOf(ctx, member, mostPeoplePackedRead), seen);
  const causes: Cause[] = [];
  for (const packed of people.slice(0, mostHypeEmojisShown)) {
    const { person, unlockedAt, collected } = packed;
    const { name, picture } = await hypeFaceOf(ctx, workspace, person);
    const earned = !isHeldForItsItem(packed, seen, held);
    causes.push({ id: `hype:${person}`, kind: "hype", from: name, picture, earned, earnedAt: earned ? unlockedAt : null, progress: { have: earned ? 1 : 0, need: 1 }, ...(collected && { byReactions: true as const }) });
  }
  return { causes, more: people.length > mostHypeEmojisShown };
}

function isHeldForItsItem({ person, collected }: PackedPerson, seen: Set<string>, held: HypesHeld | undefined) {
  return !collected && held !== undefined && !seen.has(`hype:${person}`) && holdsTheHypeOf(held, person);
}

export async function hypeEarnedBy(ctx: QueryCtx, member: MemberId, person: MemberId | null): Promise<boolean> {
  if (person === null) return false;
  return (await hypeEarnedByKudos(ctx, member, person)) || (await collectedBy(ctx, member, person)) !== null;
}

async function hypeEarnedByKudos(ctx: QueryCtx, member: MemberId, person: MemberId): Promise<boolean> {
  if (!(await hasPackedFor(ctx, member, person))) return false;
  return (await seenAtOf(ctx, member, `hype:${person}`)) !== null || !(await hypeWaitsForItsItem(ctx, member, person));
}

async function peopleWithHypeOf(ctx: QueryCtx, member: MemberId, most: number): Promise<PackedPerson[]> {
  const people = new Map((await peoplePackedBy(ctx, member, most)).map((packed) => [packed.person, packed]));
  for (const { person, at } of await peopleCollectedBy(ctx, member, most)) people.set(person, { person, unlockedAt: at, collected: true });
  return [...people.values()];
}

function unseenFirst(people: PackedPerson[], seen: Set<string>): PackedPerson[] {
  const isSeen = ({ person }: PackedPerson) => seen.has(`hype:${person}`);
  return [...people.filter((packed) => !isSeen(packed)), ...people.filter(isSeen)];
}

export async function hypeUnlockedByReactions(ctx: QueryCtx, member: MemberId, person: MemberId): Promise<boolean> {
  return (await collectedBy(ctx, member, person)) !== null;
}

async function peoplePackedBy(ctx: QueryCtx, giver: MemberId, most: number): Promise<PackedPerson[]> {
  const people: PackedPerson[] = [];
  for (let after: MemberId | null = null; people.length < most; ) {
    const last: MemberId | null = after;
    const pack = await ctx.db
      .query("thoughtfulPacks")
      .withIndex("by_giver_recipient_week", (q) => (last === null ? q.eq("giver", giver) : q.eq("giver", giver).gt("recipient", last)))
      .first();
    if (pack === null) break;
    people.push({ person: pack.recipient, unlockedAt: pack.at, collected: false });
    after = pack.recipient;
  }
  return people;
}

async function nameOrUnnamed(ctx: QueryCtx, person: MemberId): Promise<string> {
  return (await nameAndPictureOf(ctx, person)).name ?? unnamedPerson;
}

export async function hypeFaceOf(ctx: QueryCtx, workspace: string, person: MemberId): Promise<{ name: string; picture: string }> {
  const companyFace = await storedCompanyFaceOf(ctx, workspace, person);
  const { name, picture } = await nameAndPictureOf(ctx, person);
  return { name: name ?? unnamedPerson, picture: companyFace?.image ?? picture ?? hypeEmblemPicture };
}

async function seenBy(ctx: QueryCtx, member: MemberId): Promise<Set<string>> {
  const seen = await ctx.db
    .query("seenEmojis")
    .withIndex("by_member_emoji", (q) => q.eq("member", member))
    .collect();
  return new Set(seen.map(({ emoji }) => emoji));
}

export async function holdsEarnedEmojiNamed(ctx: QueryCtx, workspace: string, member: MemberId, toned: string): Promise<boolean> {
  return (await earnedEmojiNamesAmong(ctx, workspace, member, [toned], () => true)).length > 0;
}

export async function earnedEmojiNamesAmong(ctx: QueryCtx, workspace: string, member: MemberId, names: string[], counts: (emoji: string) => boolean | Promise<boolean>): Promise<string[]> {
  const earned = new Set<string>();
  for (const { name, emoji, dropped } of await namedEmojisAmong(ctx, workspace, member, names)) {
    if (!earned.has(name) && (await counts(emoji)) && (dropped || (await isEarnedBy(ctx, member, emoji)))) earned.add(name);
  }
  return [...earned];
}

type NamedEmoji = { name: string; emoji: string; dropped: boolean };

async function namedEmojisAmong(ctx: QueryCtx, workspace: string, member: MemberId, names: string[]): Promise<NamedEmoji[]> {
  const distinct = [...new Set(names)];
  if (distinct.length <= mostEmojiNamesLookedUpOneByOne) return namedOneByOne(ctx, workspace, member, distinct);
  const registry = await namesHeldIn(ctx, workspace);
  const drops = new Set(await randomEmojiNamesHeldBy(ctx, member));
  return distinct.flatMap((name) => {
    const registered = registry.get(withoutSkinTone(name));
    return [...(drops.has(name) ? [droppedNamed(name)] : []), ...(registered === undefined ? [] : [{ name, emoji: registered, dropped: false }])];
  });
}

async function namedOneByOne(ctx: QueryCtx, workspace: string, member: MemberId, names: string[]): Promise<NamedEmoji[]> {
  const named: NamedEmoji[] = [];
  for (const name of names) {
    const bare = withoutSkinTone(name);
    if (await holdsRandomEmoji(ctx, member, bare)) named.push({ ...droppedNamed(bare), name });
    const registered = await emojiNamed(ctx, workspace, bare);
    if (registered !== null) named.push({ name, emoji: registered, dropped: false });
  }
  return named;
}

function droppedNamed(name: string): NamedEmoji {
  return { name, emoji: `random:${name}`, dropped: true };
}

export async function holdsEarnedEmoji(ctx: QueryCtx, member: MemberId, emoji: string): Promise<boolean> {
  const [kind, cause] = splitOnce(emoji);
  return kind === "random" ? holdsRandomEmoji(ctx, member, cause) : isEarnedBy(ctx, member, emoji);
}

export async function isEarnedBy(ctx: QueryCtx, member: MemberId, id: string): Promise<boolean> {
  const [kind, cause] = splitOnce(id);
  if (kind === "team") return (await teamStickerOf(ctx, member, cause)) !== null;
  if (kind === "milestone") return holdsMilestoneTier(ctx, member, cause);
  if (kind === "level") return holdsLevelEmoji(ctx, member, cause);
  if (kind === "hype") return hypeEarnedBy(ctx, member, ctx.db.normalizeId("members", cause));
  if (kind === "random") return (await randomEmojisShownTo(ctx, member)) && (await holdsRandomEmoji(ctx, member, cause));
  return false;
}

async function holdsLevelEmoji(ctx: QueryCtx, member: MemberId, cause: string): Promise<boolean> {
  const level = Number(cause);
  return String(level) === cause && (await isEmojiLevelOf(ctx, member, level)) && (await progressionHomeOf(ctx, member)).level >= level;
}

function splitOnce(id: string): [string, string] {
  const colon = id.indexOf(":");
  return colon === -1 ? [id, ""] : [id.slice(0, colon), id.slice(colon + 1)];
}

function teamStickerOf(ctx: QueryCtx, member: MemberId, team: string) {
  return ctx.db
    .query("teamStickers")
    .withIndex("by_member_team", (q) => q.eq("member", member).eq("team", team))
    .first();
}

async function holdsMilestoneTier(ctx: QueryCtx, member: MemberId, cause: string): Promise<boolean> {
  const emoji = milestoneTierEmojiOf(cause);
  const reached = emoji === null ? null : await tierOf(ctx, member, emoji.milestone, emoji.tier);
  return reached !== null && (await isTierTurnedBy(ctx, member, reached));
}

async function isTierTurnedBy(ctx: QueryCtx, member: MemberId, tier: ReachedTier & { at: number }): Promise<boolean> {
  return !(await hiddenItemsShownTo(ctx, member)) || (await tierUnlockedAt(ctx, member, tier, tier.at)) !== null;
}

function tierOf(ctx: QueryCtx, member: MemberId, milestone: MilestoneId, tier: MilestoneTier) {
  return ctx.db
    .query("milestoneTiers")
    .withIndex("by_member_milestone_tier", (q) => q.eq("member", member).eq("milestone", milestone).eq("tier", tier))
    .first();
}

async function hasPackedFor(ctx: QueryCtx, giver: MemberId, recipient: MemberId): Promise<boolean> {
  return (await firstPackFor(ctx, giver, recipient)) !== null;
}

function firstPackFor(ctx: QueryCtx, giver: MemberId, recipient: MemberId) {
  return ctx.db
    .query("thoughtfulPacks")
    .withIndex("by_giver_recipient_week", (q) => q.eq("giver", giver).eq("recipient", recipient))
    .first();
}
