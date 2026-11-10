// The module map's skeleton of convex/album/tallies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hugGivenEventValidator, kudosGivenEventValidator } from "../bus/events.ts";
import type { DayKey } from "../engine/allowance.ts";
import type { AwardId } from "../engine/awards.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { Hug } from "../hugs/records.ts";
import type { MemberId } from "../workspace/directory.ts";
import { pairTallyValidator, weekTallyValidator, type HoggieFound } from "./records.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
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

type PeopleList = { people: MemberId[]; more: number };

const daysInAWeek = 7;
const nobody: PeopleList = { people: [], more: 0 };

export const tallyKudosGivenArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
export async function tallyKudosGiven(ctx: MutationContext, args: z.infer<typeof tallyKudosGivenArgs>): Promise<null> {
  throw notPorted("album.tallies.tallyKudosGiven");
}
export const tallyKudosGivenJob = mutationJob("album.tallies.tallyKudosGiven", tallyKudosGivenArgs, tallyKudosGiven);

export const tallyHugGivenArgs = z.strictObject({ event: hugGivenEventValidator });
export async function tallyHugGiven(ctx: MutationContext, args: z.infer<typeof tallyHugGivenArgs>): Promise<null> {
  throw notPorted("album.tallies.tallyHugGiven");
}
export const tallyHugGivenJob = mutationJob("album.tallies.tallyHugGiven", tallyHugGivenArgs, tallyHugGiven);

export const tallyHugArgs = z.strictObject({ hug: zv.id("hugs"), after: zv.id("members") });
export async function tallyHug(ctx: MutationContext, args: z.infer<typeof tallyHugArgs>): Promise<null> {
  throw notPorted("album.tallies.tallyHug");
}
export const tallyHugJob = mutationJob("album.tallies.tallyHug", tallyHugArgs, tallyHug);

export async function pairTallyFor(ctx: QueryContext, member: MemberId, person: MemberId): Promise<PairTally | null> {
  throw notPorted("album.tallies.pairTallyFor");
}

export function weekTallyIn({ _id, _creationTime, member: _member, week: _week, ...tally }: Doc<"weekTallies">): WeekTally {
  return tally;
}

export async function tallyPackOpened(ctx: MutationContext, member: MemberId, at: number): Promise<void> {
  throw notPorted("album.tallies.tallyPackOpened");
}

export async function tallyNewFace(ctx: MutationContext, member: MemberId, person: MemberId, at: number): Promise<void> {
  throw notPorted("album.tallies.tallyNewFace");
}

export async function tallyHoggieFound(ctx: MutationContext, member: MemberId, hoggie: HoggieFound, at: number): Promise<void> {
  throw notPorted("album.tallies.tallyHoggieFound");
}

export async function weekAt(ctx: QueryContext, member: MemberId, at: number): Promise<DayKey> {
  throw notPorted("album.tallies.weekAt");
}

export async function storedKudosWeightOf(ctx: QueryContext, message: MessageRef): Promise<KudosWeight> {
  throw notPorted("album.tallies.storedKudosWeightOf");
}

export async function tallyAward(ctx: MutationContext, award: KudosAward, { words, hugs }: KudosWeight): Promise<void> {
  throw notPorted("album.tallies.tallyAward");
}

export type HugPeopleTallied = { tallied: number; last: MemberId | null };

export async function tallyHugPeople(ctx: MutationContext, hug: Hug, after: MemberId | null, atMost: number): Promise<HugPeopleTallied> {
  throw notPorted("album.tallies.tallyHugPeople");
}

export function anEmptyPair(): PairTally {
  return { firstThankedAt: null, kudosGiven: 0, kudosReceived: 0, hugsGiven: 0, hugsReceived: 0, best: null };
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

export function weekRowOf(ctx: QueryContext, member: MemberId, week: DayKey): Promise<null | Doc<"weekTallies">> {
  throw notPorted("album.tallies.weekRowOf");
}

export async function awardsTallied(ctx: QueryContext, awards: { award: AwardId }[]): Promise<boolean> {
  throw notPorted("album.tallies.awardsTallied");
}

export function talliedAwardOf(ctx: QueryContext, award: AwardId): Promise<null | Doc<"talliedAwards">> {
  throw notPorted("album.tallies.talliedAwardOf");
}
