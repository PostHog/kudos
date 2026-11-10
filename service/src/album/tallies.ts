// The album's tallies: per pair of members and per member's week, what they gave and received, kudos and hugs, each
// award and each hug person counted once. Today's convex/album/tallies.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import { hugGivenEventValidator, kudosGivenEventValidator } from "../bus/events.ts";
import { allowanceDay, type DayKey } from "../engine/allowance.ts";
import { givenFactsOf, storedAnnotationsOf, type AwardId } from "../engine/awards.ts";
import { isSameMessage, type Annotations, type MessageRef } from "../engine/messageEvent.ts";
import { hugOf, hugPeopleAfter, hugWithId, type Hug } from "../hugs/records.ts";
import { hugsOnTheMessage } from "../hugs/weeks.ts";
import { wordCountOf } from "../progression/gate.ts";
import { givingWeekOf } from "../progression/progress.ts";
import { timeZoneOf, type MemberId } from "../workspace/directory.ts";
import { countOnTheBoards } from "./boards.ts";
import { recordMilestonesOf } from "./milestones.ts";
import { pairTallyValidator, weekTallyValidator, type HoggieFound, type HugPick, type KudosPick, type WeekList } from "./records.ts";
import { insertInto, replaceIn, uniqueIn } from "./rows.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { pairTallies, talliedAwards, talliedHugs, weekPeople, weekTallies, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export const awardsPerTally = 50;
export const peoplePerHugTally = 50;
export const peopleListed = 12;

export type KudosAward = { award: AwardId; message: MessageRef; giver: MemberId; recipient: MemberId; kudos: number; day: DayKey; at: number };

export type KudosWeight = { words: number; hugs: number };

const pairTallyAnswer = pairTallyValidator.omit({ "member": true, "person": true });

const weekTallyAnswer = weekTallyValidator.omit({ "member": true, "week": true });

export type PairTally = z.infer<typeof pairTallyAnswer>;

export type WeekTally = z.infer<typeof weekTallyAnswer>;

type PairChange = { kudosGiven?: number; kudosReceived?: number; hugsGiven?: number; hugsReceived?: number; thankedAt?: number; best?: KudosPick };

type WeekChange = {
  kudosGiven?: number;
  kudosReceived?: number;
  thoughtfulGiven?: number;
  thoughtfulReceived?: number;
  hugsGiven?: number;
  hugsReceived?: number;
  listed?: { list: WeekList; person: MemberId };
  pick?: HugPick;
  on?: DayKey;
  opened?: number;
  newFace?: MemberId;
  hoggie?: HoggieFound;
};

type PeopleList = { people: MemberId[]; more: number };

type HoggiesList = { hoggies: HoggieFound[]; more: number };

type KudosOfTheWeek = { giver: MemberId; week: DayKey; pick: HugPick };

const daysInAWeek = 7;
const nobody: PeopleList = { people: [], more: 0 };
const noHoggies: HoggiesList = { hoggies: [], more: 0 };
const dayMs = 24 * 60 * 60 * 1000;

export const tallyKudosGivenArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
export async function tallyKudosGiven(ctx: MutationContext, { event, from = 0 }: z.infer<typeof tallyKudosGivenArgs>): Promise<null> {
  const next = from + awardsPerTally;
  const weight = await kudosWeightOf(ctx, event.message, event.annotations);
  for (const { award, giver, recipient, kudos } of event.awards.slice(from, next)) {
    await tallyAward(ctx, { award, message: event.message, giver, recipient, kudos, day: event.day, at: event.at }, weight);
  }
  await recordMilestonesOf(ctx, { workspace: event.workspace, member: event.giver }, ctx.now);
  if (next < event.awards.length) await ctx.jobs.enqueue(tallyKudosGivenJob, { event, from: next });
  return null;
}
export const tallyKudosGivenJob = mutationJob("album.tallies.tallyKudosGiven", tallyKudosGivenArgs, tallyKudosGiven);

export const tallyHugGivenArgs = z.strictObject({ event: hugGivenEventValidator });
export async function tallyHugGiven(ctx: MutationContext, { event }: z.infer<typeof tallyHugGivenArgs>): Promise<null> {
  const hug = await hugOf(ctx, event.message, event.giver);
  if (hug !== null) await tallyHugFrom(ctx, hug, null);
  return null;
}
export const tallyHugGivenJob = mutationJob("album.tallies.tallyHugGiven", tallyHugGivenArgs, tallyHugGiven);

export const tallyHugArgs = z.strictObject({ hug: zv.id("hugs"), after: zv.id("members") });
export async function tallyHug(ctx: MutationContext, { hug, after }: z.infer<typeof tallyHugArgs>): Promise<null> {
  const found = await hugWithId(ctx, hug);
  if (found !== null) await tallyHugFrom(ctx, found, after);
  return null;
}
export const tallyHugJob = mutationJob("album.tallies.tallyHug", tallyHugArgs, tallyHug);

export async function pairTallyFor(ctx: QueryContext, member: MemberId, person: MemberId): Promise<PairTally | null> {
  const row = await pairRowOf(ctx, member, person);
  if (row === null) return null;
  const { _id, _creationTime, member: _member, person: _person, ...tally } = row;
  return tally;
}

export function weekTallyIn({ _id, _creationTime, member: _member, week: _week, ...tally }: Doc<"weekTallies">): WeekTally {
  return tally;
}

export async function tallyPackOpened(ctx: MutationContext, member: MemberId, at: number): Promise<void> {
  await changeWeek(ctx, member, await weekAt(ctx, member, at), { opened: 1 });
}

export async function tallyNewFace(ctx: MutationContext, member: MemberId, person: MemberId, at: number): Promise<void> {
  await changeWeek(ctx, member, await weekAt(ctx, member, at), { newFace: person });
}

export async function tallyHoggieFound(ctx: MutationContext, member: MemberId, hoggie: HoggieFound, at: number): Promise<void> {
  await changeWeek(ctx, member, await weekAt(ctx, member, at), { hoggie });
}

export async function weekAt(ctx: QueryContext, member: MemberId, at: number): Promise<DayKey> {
  return givingWeekOf(allowanceDay(at, (await timeZoneOf(ctx, member)) ?? undefined));
}

async function kudosWeightOf(ctx: QueryContext, message: MessageRef, annotations: Annotations): Promise<KudosWeight> {
  return { words: wordCountOf(annotations) ?? 0, hugs: await hugsOnTheMessage(ctx, message) };
}

export async function storedKudosWeightOf(ctx: QueryContext, message: MessageRef): Promise<KudosWeight> {
  return kudosWeightOf(ctx, message, await storedAnnotationsOf(ctx, message));
}

export async function tallyAward(ctx: MutationContext, award: KudosAward, { words, hugs }: KudosWeight): Promise<void> {
  if ((await talliedAwardOf(ctx, award.award)) !== null) return;
  await insertInto(ctx, talliedAwards, { award: award.award, everyKudos: true });
  const { message, giver, recipient, kudos, day, at } = award;
  const week = givingWeekOf(day);
  const pick = { message, hugs, words, at };
  await changePair(ctx, giver, recipient, { kudosGiven: kudos, thankedAt: at, best: { message, words, at } });
  await changePair(ctx, recipient, giver, { kudosReceived: kudos });
  await changeWeek(ctx, giver, week, { kudosGiven: kudos, thoughtfulGiven: 1, listed: { list: "thanked", person: recipient }, pick, on: day });
  await changeWeek(ctx, recipient, week, { kudosReceived: kudos, thoughtfulReceived: 1, listed: { list: "thankedBy", person: giver }, pick, on: day });
  await countOnTheBoards(ctx, { workspace: message.workspace, giver, day });
}

export type HugPeopleTallied = { tallied: number; last: MemberId | null };

export async function tallyHugPeople(ctx: MutationContext, hug: Hug, after: MemberId | null, atMost: number): Promise<HugPeopleTallied> {
  const kudos = hug.onKudos ? await kudosOfTheWeekOf(ctx, hug) : null;
  if (after === null && kudos !== null) await changeWeek(ctx, kudos.giver, kudos.week, { pick: kudos.pick });
  if (after === null) await tallyHugGiverSide(ctx, hug);
  const { people, last } = await hugPeopleAfter(ctx, hug, after, atMost);
  for (const person of people) await tallyHugTo(ctx, hug, person, kudos);
  return { tallied: people.length, last };
}

async function tallyHugFrom(ctx: MutationContext, hug: Hug, after: MemberId | null) {
  const { last } = await tallyHugPeople(ctx, hug, after, peoplePerHugTally);
  if (last !== null) await ctx.jobs.enqueue(tallyHugJob, { hug: hug._id, after: last });
}

async function kudosOfTheWeekOf(ctx: QueryContext, hug: Hug): Promise<KudosOfTheWeek | null> {
  const message = { workspace: hug.workspace, conversation: hug.conversation, message: hug.message };
  const given = await givenFactsOf(ctx, message);
  if (given === null) return null;
  const { words, hugs } = await storedKudosWeightOf(ctx, message);
  return { giver: given.giver, week: givingWeekOf(given.day), pick: { message, hugs, words, at: given.at } };
}

async function tallyHugGiverSide(ctx: MutationContext, hug: Hug) {
  if (await isHugTallied(ctx, hug, hug.giver)) return;
  await insertInto(ctx, talliedHugs, { hug: hug._id, person: hug.giver });
  await changeWeek(ctx, hug.giver, givingWeekOf(hug.day), { hugsGiven: 1, on: hug.day });
}

async function tallyHugTo(ctx: MutationContext, hug: Hug, person: MemberId, kudos: KudosOfTheWeek | null) {
  if (person === hug.giver) return;
  if (kudos !== null) await changeWeek(ctx, person, kudos.week, { pick: kudos.pick });
  if (await isHugTallied(ctx, hug, person)) return;
  await insertInto(ctx, talliedHugs, { hug: hug._id, person });
  const week = givingWeekOf(hug.day);
  await changePair(ctx, hug.giver, person, { hugsGiven: 1 });
  await changePair(ctx, person, hug.giver, { hugsReceived: 1 });
  await changeWeek(ctx, hug.giver, week, { listed: { list: "hugged", person } });
  await changeWeek(ctx, person, week, { hugsReceived: 1, listed: { list: "huggedBy", person: hug.giver }, on: hug.day });
}

async function changePair(ctx: MutationContext, member: MemberId, person: MemberId, change: PairChange) {
  const row = await pairRowOf(ctx, member, person);
  const tally = row ?? { member, person, ...anEmptyPair() };
  const changed = {
    ...tally,
    kudosGiven: tally.kudosGiven + (change.kudosGiven ?? 0),
    kudosReceived: tally.kudosReceived + (change.kudosReceived ?? 0),
    hugsGiven: tally.hugsGiven + (change.hugsGiven ?? 0),
    hugsReceived: tally.hugsReceived + (change.hugsReceived ?? 0),
    firstThankedAt: earliestOf(tally.firstThankedAt, change.thankedAt),
    best: change.best === undefined ? tally.best : bestOf(tally.best, change.best),
  };
  if (row === null) await insertInto(ctx, pairTallies, changed);
  else await replaceIn(ctx, pairTallies, row, changed);
}

async function changeWeek(ctx: MutationContext, member: MemberId, week: DayKey, change: WeekChange) {
  const row = await weekRowOf(ctx, member, week);
  const tally = row ?? emptyWeekOf(member, week);
  const changed = {
    ...tally,
    kudosGiven: tally.kudosGiven + (change.kudosGiven ?? 0),
    kudosReceived: tally.kudosReceived + (change.kudosReceived ?? 0),
    thoughtfulGiven: tally.thoughtfulGiven + (change.thoughtfulGiven ?? 0),
    thoughtfulReceived: tally.thoughtfulReceived + (change.thoughtfulReceived ?? 0),
    hugsGiven: tally.hugsGiven + (change.hugsGiven ?? 0),
    hugsReceived: tally.hugsReceived + (change.hugsReceived ?? 0),
    ...(change.listed !== undefined && { [change.listed.list]: await listedIn(ctx, tally, change.listed) }),
    kudosOfWeek: change.pick === undefined ? tally.kudosOfWeek : kudosOfTheWeek(tally.kudosOfWeek, change.pick),
    days: change.on === undefined ? tally.days : countedOn(tally.days, week, change.on),
    ...(change.opened !== undefined && { packsOpened: (tally.packsOpened ?? 0) + change.opened }),
    ...(change.newFace !== undefined && { newFaces: withOneMore(tally.newFaces ?? nobody, change.newFace) }),
    ...(change.hoggie !== undefined && { hoggiesFound: withHoggie(tally.hoggiesFound ?? noHoggies, change.hoggie) }),
  };
  if (row === null) await insertInto(ctx, weekTallies, changed);
  else await replaceIn(ctx, weekTallies, row, changed);
}

export function anEmptyPair(): PairTally {
  return { firstThankedAt: null, kudosGiven: 0, kudosReceived: 0, hugsGiven: 0, hugsReceived: 0, best: null };
}

function emptyWeekOf(member: MemberId, week: DayKey) {
  return { member, week, ...anEmptyWeek() };
}

export function anEmptyWeek(): WeekTally {
  return {
    kudosGiven: 0,
    kudosReceived: 0,
    thoughtfulGiven: 0,
    thoughtfulReceived: 0,
    hugsGiven: 0,
    hugsReceived: 0,
    thanked: nobody,
    thankedBy: nobody,
    hugged: nobody,
    huggedBy: nobody,
    kudosOfWeek: null,
    days: Array.from({ length: daysInAWeek }, () => 0),
  };
}

const byMemberWeekListPerson = indexOrder(weekPeople, ["member", "week", "list", "person"]);

async function listedIn(ctx: MutationContext, tally: { member: MemberId; week: DayKey } & Record<WeekList, PeopleList>, { list, person }: { list: WeekList; person: MemberId }) {
  const listed = tally[list];
  const where = and(eq(weekPeople.member, tally.member), eq(weekPeople.week, tally.week), eq(weekPeople.list, list), eq(weekPeople.person, person));
  const already = await uniqueIn<Doc<"weekPeople">>(ctx, weekPeople, byMemberWeekListPerson, where);
  if (already !== null) return listed;
  await insertInto(ctx, weekPeople, { member: tally.member, week: tally.week, list, person });
  return withOneMore(listed, person);
}

function withOneMore({ people, more }: PeopleList, person: MemberId): PeopleList {
  return people.length < peopleListed ? { people: [...people, person], more } : { people, more: more + 1 };
}

function withHoggie({ hoggies, more }: HoggiesList, hoggie: HoggieFound): HoggiesList {
  return hoggies.length < peopleListed ? { hoggies: [...hoggies, hoggie], more } : { hoggies, more: more + 1 };
}

function earliestOf(current: number | null, at: number | undefined) {
  if (at === undefined) return current;
  return current === null ? at : Math.min(current, at);
}

function bestOf(current: KudosPick | null, candidate: KudosPick): KudosPick {
  if (current === null) return candidate;
  if (candidate.words !== current.words) return candidate.words > current.words ? candidate : current;
  return candidate.at >= current.at ? candidate : current;
}

function kudosOfTheWeek(current: HugPick | null, candidate: HugPick): HugPick {
  if (current === null || isSameMessage(current.message, candidate.message)) return candidate;
  if (candidate.hugs !== current.hugs) return candidate.hugs > current.hugs ? candidate : current;
  if (candidate.words !== current.words) return candidate.words > current.words ? candidate : current;
  return candidate.at >= current.at ? candidate : current;
}

function countedOn(days: number[], week: DayKey, day: DayKey) {
  const index = Math.round((Date.parse(day) - Date.parse(week)) / dayMs);
  return days.map((count, each) => (each === index ? count + 1 : count));
}

const byMemberPerson = indexOrder(pairTallies, ["member", "person"]);
const byMemberWeek = indexOrder(weekTallies, ["member", "week"]);
const byAward = indexOrder(talliedAwards, ["award"]);
const byHugPerson = indexOrder(talliedHugs, ["hug", "person"]);

function pairRowOf(ctx: QueryContext, member: MemberId, person: MemberId) {
  return uniqueIn<Doc<"pairTallies">>(ctx, pairTallies, byMemberPerson, and(eq(pairTallies.member, member), eq(pairTallies.person, person)));
}

export function weekRowOf(ctx: QueryContext, member: MemberId, week: DayKey): Promise<null | Doc<"weekTallies">> {
  return uniqueIn<Doc<"weekTallies">>(ctx, weekTallies, byMemberWeek, and(eq(weekTallies.member, member), eq(weekTallies.week, week)));
}

export async function awardsTallied(ctx: QueryContext, awards: { award: AwardId }[]): Promise<boolean> {
  const tallied = await Promise.all(awards.map(({ award }) => talliedAwardOf(ctx, award)));
  return tallied.every((marker) => marker !== null);
}

export function talliedAwardOf(ctx: QueryContext, award: AwardId): Promise<null | Doc<"talliedAwards">> {
  return uniqueIn<Doc<"talliedAwards">>(ctx, talliedAwards, byAward, eq(talliedAwards.award, award));
}

async function isHugTallied(ctx: QueryContext, hug: Hug, person: MemberId) {
  const where = and(eq(talliedHugs.hug, hug._id), eq(talliedHugs.person, person));
  return (await uniqueIn<Doc<"talliedHugs">>(ctx, talliedHugs, byHugPerson, where)) !== null;
}
