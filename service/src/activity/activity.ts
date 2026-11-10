// A member's activity for the website, as today's convex/activity/activity.ts: a page of the kudos, level-ups, finds
// and hugs they were part of, newest decided first, read through each owner's exported reads, never their tables.
import type { QueryContext } from "../operations.ts";
import { awardsReceivedByDecision, messagesGivenByDecision, type DecidedBelow, type GivenMessageAwards, type MessageAward, type ReceivedAward } from "../engine/awards.ts";
import { awardsTallied } from "../album/tallies.ts";
import { takenBackInSlack } from "../engine/kudosText.ts";
import { dropsByDecision } from "../album/hoggies/drops.ts";
import { crestsShownTo, hoggiesShownTo } from "../album/hoggies/flag.ts";
import { bonusRecordedWith, xpRecordedFor } from "../progression/effects.ts";
import { bonusGainsShownTo, questGainsShownTo, xpGainsShownTo } from "../progression/gainsView.ts";
import { catalogue } from "../progression/catalogue.ts";
import { giverXpOf } from "../progression/progression.ts";
import { perkOf } from "../progression/tree.ts";
import { questsFinishedByMessage } from "../quests/finishedBy.ts";
import { questsJudgedFor } from "../quests/judged.ts";
import { hugsShownTo } from "../hugs/flag.ts";
import { withoutSkinTone } from "../workspace/slackEmoji.ts";
import { hugsGivenByDecision, hugsOnTheMessageAsOf, hugsReceivedByDecision, hugsReceivedSnapshot, type GivenHug, type ReceivedHugs, type TimelineHug } from "../hugs/records.ts";
import { hugXp } from "../hugs/xp.ts";
import { levelUpsByDecision } from "../unlocks/unlocks.ts";
import { chatUserOf, timeZoneOf, type MemberId } from "../workspace/directory.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { Activity, ActivityEntry, BonusEarned, Found, KudosGiven, KudosReceived, LevelUp, Message, RecentKudos, HugGiven, HugReceived } from "./entries.ts";
import { kudosFactsOf, kudosWordsStillInSlack, mentionLookupsPerPage, mentionsOfOnePage, permalinkOfMessage, personOf, type Mentions } from "./kudos.ts";
import { belowFor, decodeCursor, encodeCursor, keyOf, newestFirst, ranks, type Cursor, type Position, type Rank } from "./position.ts";

export type Filter = "all" | "received" | "given";

export type Direction = Exclude<Filter, "all">;

type GainsShown = { xp: boolean; quests: boolean; bonuses: boolean };

type Viewer = { member: MemberId; gainsShown: () => Promise<GainsShown>; hugsShown: () => Promise<boolean>; hugsAsOf: number | undefined; questsAwaitedAbove: number; talliesAwaitedAbove: number };

type Pending = { position: Position; recipients?: number; entry: (mentions: Mentions) => Promise<ActivityEntry>; xp: () => Promise<number | null>; settled?: () => Promise<boolean>; takenBack?: () => Promise<boolean> };

type Read = { pending: Pending[]; cut: boolean };

type Source = { rank: Rank; read: (ctx: QueryContext, viewer: Viewer, below: DecidedBelow, take: number) => Promise<Read> };

type PageSize = { min: number; max: number; usual: number };

const activityPage: PageSize = { min: 1, max: 50, usual: 20 };
const recentPage: PageSize = { min: 1, max: 10, usual: 5 };
const recentPagesRead = 3;

export const recipientsPerPage = 700;

const levelUps: Source = {
  rank: ranks.levelUp,
  read: async (ctx, { member, gainsShown }, below, take) => {
    if (!(await gainsShown()).xp) return { pending: [], cut: false };
    return whole(
      (await firstOf(levelUpsByDecision(ctx, member, below), take)).map(({ level, at, created }) => ({
        position: { decided: created, rank: ranks.levelUp },
        entry: async (): Promise<LevelUp> => ({ kind: "levelUp", at, level }),
        xp: async () => 0,
      })),
    );
  },
};

const kudosReceived: Source = {
  rank: ranks.kudosReceived,
  read: async (ctx, { member }, below, take) =>
    whole(
      (await firstOf(awardsReceivedByDecision(ctx, member, below), take)).map((award) => ({
        position: { decided: award.created, rank: ranks.kudosReceived },
        entry: (mentions) => receivedEntryOf(ctx, mentions, award),
        xp: () => xpRecordedFor(ctx, award.award, "recipient"),
        takenBack: () => takenBackInSlack(ctx, award.message),
      })),
    ),
};

const kudosGiven: Source = {
  rank: ranks.kudosGiven,
  read: async (ctx, viewer, below, take) => {
    const { taken, cut } = await firstWithinRecipients(messagesGivenByDecision(ctx, viewer.member, below), take, ({ awards }) => awards.length);
    return {
      pending: taken.map((given) => ({
        position: { decided: given.created, rank: ranks.kudosGiven },
        recipients: given.awards.length,
        entry: (mentions) => givenEntryOf(ctx, viewer, mentions, given),
        xp: () => giverXpRecordedFor(ctx, given),
        settled: async () => (given.created <= viewer.questsAwaitedAbove || (await questsJudgedFor(ctx, given.awards))) && (given.created <= viewer.talliesAwaitedAbove || (await awardsTallied(ctx, given.awards))),
        takenBack: () => takenBackInSlack(ctx, given.message),
      })),
      cut,
    };
  },
};

const found: Source = {
  rank: ranks.found,
  read: async (ctx, { member }, below, take) => {
    if (!(await hoggiesShownTo(ctx, member))) return whole([]);
    const shown = { crests: await crestsShownTo(ctx, member) };
    return whole(
      (await firstOf(dropsByDecision(ctx, member, below, shown), take)).map(({ at, n, decided, drop }) => ({
        position: { decided, rank: ranks.found },
        entry: async (): Promise<Found> => ({ kind: "found", at, key: keyOf({ at, rank: ranks.found, created: n }), drop }),
        xp: async () => 0,
      })),
    );
  },
};

const hugsGiven: Source = {
  rank: ranks.hugGiven,
  read: async (ctx, viewer, below, take) => {
    if (!(await viewer.hugsShown())) return whole([]);
    const { taken, cut } = await firstWithinRecipients(hugsGivenByDecision(ctx, viewer.member, below), take, ({ people }) => people.length);
    return {
      pending: taken.map((given) => ({
        position: { decided: given.created, rank: ranks.hugGiven },
        recipients: given.people.length,
        entry: (mentions) => hugGivenEntryOf(ctx, viewer, mentions, given),
        xp: async () => hugXp,
      })),
      cut,
    };
  },
};

const hugsReceived: Source = {
  rank: ranks.hugReceived,
  read: async (ctx, viewer, below, take) => {
    if (!(await viewer.hugsShown())) return whole([]);
    return whole(
      (await firstOf(hugsReceivedByDecision(ctx, viewer.member, below, viewer.hugsAsOf), take)).map((received) => ({
        position: { decided: received.created, rank: ranks.hugReceived },
        entry: (mentions) => hugReceivedEntryOf(ctx, viewer, mentions, received),
        xp: async () => received.hugs * hugXp,
      })),
    );
  },
};

const hugsReceivedSince: Source = {
  rank: ranks.hugReceived,
  read: async (ctx, viewer, below, take) => {
    if (!(await viewer.hugsShown())) return whole([]);
    return whole(
      (await firstOf(hugsReceivedByDecision(ctx, viewer.member, below, undefined), take)).map((received) => {
        const since = once(async () => ({ ...received, hugs: received.hugs - (await hugsBefore(ctx, viewer.member, received.message, below.above)) }));
        return {
          position: { decided: received.created, rank: ranks.hugReceived },
          entry: async (mentions) => hugReceivedEntryOf(ctx, viewer, mentions, await since()),
          xp: async () => (await since()).hugs * hugXp,
        };
      }),
    );
  },
};

const sourcesOf: Record<Filter, Source[]> = {
  all: [levelUps, kudosGiven, kudosReceived, found, hugsGiven, hugsReceived],
  received: [kudosReceived],
  given: [kudosGiven],
};

const sourcesSince: Source[] = [levelUps, kudosGiven, kudosReceived, hugsGiven, hugsReceivedSince];

export const mostReadSince = 50;

export type EntrySince = Exclude<ActivityEntry, Found>;

export type ReadSince = { decided: number; entry: EntrySince; xp: number; recorded: boolean; settled: boolean };

export type Since = { above?: number; upTo?: number; questsAwaitedAbove?: number; talliesAwaitedAbove?: number };

export async function activitySince(ctx: QueryContext, member: MemberId, since: Since): Promise<ReadSince[]> {
  const page = await pendingSince(ctx, member, since, mostReadSince);
  const mentions = mentionsOfOnePage(ctx, mentionLookupsPerPage, "linked");
  return Promise.all(page.map(async ({ position, entry, xp, settled }) => ({ decided: position.decided, entry: (await entry(mentions)) as EntrySince, ...recordedXpOf(await xp()), settled: (await settled?.()) ?? true })));
}

export async function positionsSince(ctx: QueryContext, member: MemberId, since: Since): Promise<Position[]> {
  return (await pendingSince(ctx, member, since, mostReadSince)).map(({ position }) => position);
}

function recordedXpOf(xp: number | null) {
  return { xp: xp ?? 0, recorded: xp !== null };
}

export async function newestDecidedSince(ctx: QueryContext, member: MemberId, since: Since): Promise<number | null> {
  const [newest] = await pendingSince(ctx, member, since, mostReadSince);
  return newest?.position.decided ?? null;
}

export async function newestDecidedTakenBackOrNotSince(ctx: QueryContext, member: MemberId, since: Since): Promise<number | null> {
  const [newest] = await everyPendingSince(ctx, member, since, 1);
  return newest?.position.decided ?? null;
}

async function pendingSince(ctx: QueryContext, member: MemberId, since: Since, size: number): Promise<Pending[]> {
  return stillShown(await everyPendingSince(ctx, member, since, size));
}

async function everyPendingSince(ctx: QueryContext, member: MemberId, { above, upTo = Infinity, questsAwaitedAbove = Infinity, talliesAwaitedAbove = Infinity }: Since, size: number): Promise<Pending[]> {
  const viewer: Viewer = { member, gainsShown: once(() => gainsShownTo(ctx, member)), hugsShown: once(() => hugsShownTo(ctx, member)), hugsAsOf: undefined, questsAwaitedAbove, talliesAwaitedAbove };
  const below = { decided: upTo, inclusive: true, ...(above !== undefined && { above }) };
  const reads = await Promise.all(sourcesSince.map(({ read }) => read(ctx, viewer, below, size + 1)));
  return newestWithin(reads, size);
}

export async function activityOf(ctx: QueryContext, member: MemberId, { filter, cursor, limit }: { filter: Filter; cursor: string | null; limit?: number }): Promise<Activity> {
  const { entries, after } = await pageOf(ctx, member, filter, cursor === null ? null : decodeCursor(cursor), sizeOf(limit, activityPage));
  return { kind: "activity", entries, cursor: after, timeZone: await timeZoneOf(ctx, member) };
}

export async function recentKudosOf(ctx: QueryContext, member: MemberId, { direction, limit }: { direction: Direction; limit?: number }): Promise<RecentKudos> {
  const size = sizeOf(limit, recentPage);
  const mentions = mentionsOfOnePage(ctx);
  const entries: RecentKudos["entries"] = [];
  let cursor: Cursor | null = null;
  for (let read = 0; read < recentPagesRead && entries.length < size; read++) {
    const page = await pageOf(ctx, member, direction, cursor, size - entries.length, mentions);
    entries.push(...page.entries.filter(isKudos));
    if (page.after === null) break;
    cursor = decodeCursor(page.after);
  }
  return { kind: "recent", entries };
}

async function pageOf(ctx: QueryContext, member: MemberId, filter: Filter, cursor: Cursor | null, size: number, mentions = mentionsOfOnePage(ctx)) {
  const hugsShown = once(() => hugsShownTo(ctx, member));
  const hugsAsOf = await hugsSnapshotOf(ctx, member, filter, hugsShown, cursor);
  const viewer: Viewer = { member, gainsShown: once(() => gainsShownTo(ctx, member)), hugsShown, hugsAsOf, questsAwaitedAbove: Infinity, talliesAwaitedAbove: Infinity };
  const after = cursor?.after ?? null;
  const reads = await Promise.all(sourcesOf[filter].map(({ rank, read }) => read(ctx, viewer, belowFor(rank, after), size + 1)));
  const pending = newestOf(reads);
  const page = newestWithin(reads, size);
  const entries = await Promise.all((await stillShown(page)).map(({ entry }) => entry(mentions)));
  const last = page.at(-1);
  const more = pending.length > page.length || reads.some((read) => read.cut);
  return { entries, after: more && last !== undefined ? encodeCursor({ after: last.position, hugsAsOf }) : null };
}

async function hugsSnapshotOf(ctx: QueryContext, member: MemberId, filter: Filter, hugsShown: () => Promise<boolean>, cursor: Cursor | null): Promise<number | undefined> {
  if (filter !== "all" || !(await hugsShown())) return undefined;
  return cursor?.hugsAsOf ?? hugsReceivedSnapshot(ctx, member);
}

function newestOf(reads: Read[]): Pending[] {
  return reads.flatMap((read) => read.pending).sort((one, other) => newestFirst(one.position, other.position));
}

function newestWithin(reads: Read[], size: number): Pending[] {
  return withinRecipients(completeUpTo(newestOf(reads), cutPositionOf(reads)).slice(0, size));
}

async function hugsBefore(ctx: QueryContext, member: MemberId, message: MessageRef, above: number | undefined): Promise<number> {
  return above === undefined ? 0 : hugsOnTheMessageAsOf(ctx, member, message, above);
}

async function giverXpRecordedFor(ctx: QueryContext, { awards }: GivenMessageAwards): Promise<number | null> {
  const paid = await Promise.all(awards.map(({ award }) => xpRecordedFor(ctx, award, "giver")));
  return paid.includes(null) ? null : paid.reduce((sum: number, xp) => sum + (xp ?? 0), 0);
}

function cutPositionOf(reads: Read[]): Position | undefined {
  return reads
    .filter((read) => read.cut)
    .map((read) => read.pending.at(-1)!.position)
    .sort(newestFirst)[0];
}

function completeUpTo(pending: Pending[], cutAt: Position | undefined) {
  return cutAt === undefined ? pending : pending.filter(({ position }) => newestFirst(position, cutAt) <= 0);
}

function withinRecipients(pending: Pending[]): Pending[] {
  const kept: Pending[] = [];
  let recipients = 0;
  for (const one of pending) {
    const more = one.recipients ?? 0;
    if (more > 0 && recipients > 0 && recipients + more > recipientsPerPage) break;
    kept.push(one);
    recipients += more;
  }
  return kept;
}

async function receivedEntryOf(ctx: QueryContext, mentions: Mentions, { award, message, giver, at, created }: ReceivedAward): Promise<KudosReceived> {
  const [person, facts] = await Promise.all([personOf(ctx, giver), kudosFactsOf(ctx, mentions, message, award)]);
  return { kind: "kudosReceived", key: keyOf({ at, rank: ranks.kudosReceived, created }), at, giver: person, ...facts };
}

async function givenEntryOf(ctx: QueryContext, viewer: Viewer, mentions: Mentions, given: GivenMessageAwards): Promise<KudosGiven> {
  const { first, message, awards, at, created } = given;
  const [recipients, facts, earned] = await Promise.all([Promise.all(awards.map(({ recipient }) => personOf(ctx, recipient))), kudosFactsOf(ctx, mentions, message, first), earnedBy(ctx, viewer, given)]);
  return { kind: "kudosGiven", key: keyOf({ at, rank: ranks.kudosGiven, created }), at, recipients, kudos: awards[0]?.kudos ?? 0, ...facts, earned };
}

async function hugReceivedEntryOf(ctx: QueryContext, viewer: Viewer, mentions: Mentions, received: ReceivedHugs): Promise<HugReceived> {
  const { givers, emoji, hugs, at } = received;
  const [persons, xp, facts] = await Promise.all([Promise.all(givers.map((giver) => personOf(ctx, giver))), hugXpShownTo(viewer, hugs), hugFactsOf(ctx, mentions, received)]);
  return { kind: "hugReceived", key: facts.on, at, givers: persons, emoji, hugs, xp, ...facts };
}

async function hugGivenEntryOf(ctx: QueryContext, viewer: Viewer, mentions: Mentions, given: GivenHug): Promise<HugGiven> {
  const { people, emoji, at, created } = given;
  const [persons, xp, facts] = await Promise.all([Promise.all(people.map((person) => personOf(ctx, person))), hugXpShownTo(viewer, 1), hugFactsOf(ctx, mentions, given)]);
  return { kind: "hugGiven", key: keyOf({ at, rank: ranks.hugGiven, created }), at, people: persons, emoji, xp, ...facts };
}

type HugFacts = { emojiImage?: string; on: string; permalink: string | null; kudos: Message | null };

async function hugFactsOf(ctx: QueryContext, mentions: Mentions, { message, onKudos, emoji }: TimelineHug): Promise<HugFacts> {
  const [emojiImage, permalink, kudos] = await Promise.all([mentions.emojiImage(message.workspace, withoutSkinTone(emoji)), permalinkOfMessage(ctx, message), onKudos ? kudosWordsStillInSlack(ctx, mentions, message) : null]);
  return { ...(emojiImage !== undefined && { emojiImage }), on: onKeyOf(message), permalink, kudos };
}

async function stillShown(pending: Pending[]): Promise<Pending[]> {
  const takenBack = await Promise.all(pending.map((one) => one.takenBack?.() ?? false));
  return pending.filter((_, index) => !takenBack[index]);
}

function onKeyOf({ conversation, message }: MessageRef): string {
  return `${conversation}/${message}`;
}

async function hugXpShownTo({ gainsShown }: Viewer, hugs: number): Promise<number | null> {
  return (await gainsShown()).xp ? hugs * hugXp : null;
}

async function earnedBy(ctx: QueryContext, { member, gainsShown }: Viewer, { message, awards }: GivenMessageAwards): Promise<KudosGiven["earned"]> {
  const shown = await gainsShown();
  if (!shown.xp && !shown.quests && !shown.bonuses) return null;
  const [questsDone, bonuses] = await Promise.all([shown.quests ? questsFinishedByMessage(ctx, member, message) : [], shown.bonuses ? bonusesEarnedBy(ctx, awards) : []]);
  return { xp: shown.xp ? giverXpOf(awards) : null, questsDone, bonuses };
}

async function bonusesEarnedBy(ctx: QueryContext, awards: MessageAward[]): Promise<BonusEarned[]> {
  const paid = await bonusRecordedWith(ctx, awards.map(({ award }) => award));
  return paid.map(({ source, xp }) => ({ perk: { id: source, name: perkOf(source).name }, why: catalogue.bonuses[source].why, xp }));
}

async function gainsShownTo(ctx: QueryContext, member: MemberId): Promise<GainsShown> {
  const { workspace } = await chatUserOf(ctx, member);
  const [xp, quests, bonuses] = await Promise.all([xpGainsShownTo(ctx, workspace, member), questGainsShownTo(ctx, member), bonusGainsShownTo(ctx, workspace, member)]);
  return { xp, quests, bonuses };
}

function once<T>(compute: () => Promise<T>): () => Promise<T> {
  let computed: Promise<T> | undefined;
  return () => (computed ??= compute());
}

function isKudos(entry: ActivityEntry): entry is KudosReceived | KudosGiven {
  return entry.kind === "kudosReceived" || entry.kind === "kudosGiven";
}

function sizeOf(limit: number | undefined, { min, max, usual }: PageSize) {
  if (limit === undefined || !Number.isFinite(limit)) return usual;
  return Math.min(max, Math.max(min, Math.floor(limit)));
}

function whole(pending: Pending[]): Read {
  return { pending, cut: false };
}

async function firstWithinRecipients<T>(items: AsyncIterable<T>, take: number, recipientsOf: (item: T) => number): Promise<{ taken: T[]; cut: boolean }> {
  const taken: T[] = [];
  let recipients = 0;
  for await (const given of items) {
    if (taken.length > 0 && recipients + recipientsOf(given) > recipientsPerPage) return { taken, cut: true };
    taken.push(given);
    recipients += recipientsOf(given);
    if (taken.length === take) break;
  }
  return { taken, cut: false };
}

async function firstOf<T>(items: AsyncIterable<T>, take: number): Promise<T[]> {
  const taken: T[] = [];
  if (take <= 0) return taken;
  for await (const item of items) {
    taken.push(item);
    if (taken.length === take) break;
  }
  return taken;
}
