// The album's person, week and profile pages: what each shows, with names, faces, kudos words and links resolved.
// Today's convex/website/albumPages.ts over the service's transaction.
import type { Message } from "../activity/entries.ts";
import { kudosWordsOf, mentionLookupsPerPage, mentionsOfOnePage, permalinkOfMessage, type Mentions } from "../activity/kudos.ts";
import { ownHypePickShownTo } from "../album/flag.ts";
import { personPageOf, type HypeEmoji, type PersonTeam } from "../album/personPage.ts";
import { lastKindNoteTo, newestStickersOf, type KindNote } from "../album/profile.ts";
import type { HoggieFound } from "../album/records.ts";
import { weekEditionOf, type Issue, type WeekTab } from "../album/weekIssue.ts";
import type { WeekKudos, WeekKudosList } from "../album/weekKudos.ts";
import { storedCompanyFaceOf } from "../companyProfiles/storedFaces.ts";
import { givenFactsOf } from "../engine/awards.ts";
import { takenBackInSlack } from "../engine/kudosText.ts";
import { publicKudosOf } from "../engine/spotlight.ts";
import type { DayKey } from "../engine/allowance.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { profileLinkOf } from "../slack/permalink.ts";
import { chatUserOf, nameAndPictureOf, type MemberId } from "../workspace/directory.ts";
import { workspaceUrlOf } from "../workspace/url.ts";
import { companyTeammateOf, type Face } from "./faces.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";

export type AlbumPersonFace = { person: MemberId; name: string; face: Face };

const mentionLookupsAnIssue = 1_000;

export type AlbumKudos = { message: Message; permalink: string | null; at: number };

export type AlbumPersonAnswer = AlbumPersonFace & {
  kind: "person";
  held: boolean;
  firstThankedAt: number | null;
  kudosGiven: number;
  kudosReceived: number;
  hugsGiven: number;
  hugsReceived: number;
  best: AlbumKudos | null;
  teams: PersonTeam[];
  hype: HypeEmoji;
  slackProfile: string | null;
  hypePick?: true;
};

export type PeopleShown = { people: AlbumPersonFace[]; more: number };

export type AlbumWeekKudos = { message: Message; at: number; people: AlbumPersonFace[]; morePeople: number };

export type AlbumWeekKudosList = { kudos: AlbumWeekKudos[]; more: boolean };

export type AlbumIssue = Omit<Issue, "kudosOfWeek" | "thanked" | "thankedBy" | "hugged" | "huggedBy" | "newFaces" | "hoggiesFound" | "given" | "received"> & {
  kudosOfWeek: (AlbumKudos & { giver: AlbumPersonFace; hugs: number }) | null;
  thanked: PeopleShown;
  thankedBy: PeopleShown;
  hugged: PeopleShown;
  huggedBy: PeopleShown;
  newFaces: PeopleShown;
  hoggies: { hoggies: HoggieFound[]; more: number };
  given: AlbumWeekKudosList;
  received: AlbumWeekKudosList;
};

export type AlbumWeekAnswer = { kind: "week"; week: DayKey; thisWeek: DayKey; weeks: WeekTab[]; issue: AlbumIssue | null };

export type AlbumKindNote = AlbumKudos & { giver: AlbumPersonFace };

export type AlbumProfileAnswer = { kind: "profile"; note: AlbumKindNote | null; newest: (AlbumPersonFace & { at: number })[] };

export async function albumPersonOf(ctx: QueryContext, me: VerifiedMember, person: MemberId): Promise<AlbumPersonAnswer | { kind: "no-person" }> {
  const page = await personPageOf(ctx, me, person);
  if (page === null) return { kind: "no-person" };
  const { best, ...history } = page;
  const mentions = mentionsOfOnePage(ctx, mentionLookupsPerPage, "linked");
  return {
    kind: "person",
    ...(await faceIn(ctx, me.workspace, person)),
    ...history,
    best: best === null || (await takenBackInSlack(ctx, best.message)) ? null : await kudosShown(ctx, mentions, best.message, best.at),
    slackProfile: await slackProfileOf(ctx, me.workspace, person),
    ...(await hypePickOn(ctx, me, person)),
  };
}

async function hypePickOn(ctx: QueryContext, me: VerifiedMember, person: MemberId): Promise<Pick<AlbumPersonAnswer, "hypePick">> {
  return person === me.member && (await ownHypePickShownTo(ctx, me.member)) ? { hypePick: true } : {};
}

async function slackProfileOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<string | null> {
  const workspaceUrl = await workspaceUrlOf(ctx, workspace);
  return workspaceUrl === null ? null : profileLinkOf(workspaceUrl, (await chatUserOf(ctx, person)).user);
}

export async function albumWeekOf(ctx: QueryContext, me: VerifiedMember, asked: DayKey | undefined): Promise<AlbumWeekAnswer> {
  const { week, thisWeek, weeks, issue } = await weekEditionOf(ctx, me.member, asked, ctx.now);
  return { kind: "week", week, thisWeek, weeks, issue: issue === null ? null : await issueShown(ctx, me.workspace, issue) };
}

export async function albumProfileOf(ctx: QueryContext, me: VerifiedMember, peopleSearched: number): Promise<AlbumProfileAnswer> {
  const note = await lastKindNoteTo(ctx, me.member);
  const newest = await newestStickersOf(ctx, me.member, peopleSearched);
  return {
    kind: "profile",
    note: note === null ? null : await kindNoteShown(ctx, me.workspace, note),
    newest: await Promise.all(newest.map(async ({ person, at }) => ({ ...(await faceIn(ctx, me.workspace, person)), at }))),
  };
}

async function kindNoteShown(ctx: QueryContext, workspace: string, { giver, message, at }: KindNote): Promise<AlbumKindNote> {
  return { giver: await faceIn(ctx, workspace, giver), ...(await kudosShown(ctx, mentionsOfOnePage(ctx, mentionLookupsPerPage, "linked"), message, at)) };
}

async function issueShown(ctx: QueryContext, workspace: string, { kudosOfWeek, thanked, thankedBy, hugged, huggedBy, newFaces, hoggiesFound, given, received, ...counts }: Issue): Promise<AlbumIssue> {
  const people = async ({ people: listed, more }: { people: MemberId[]; more: number }): Promise<PeopleShown> => ({ people: await Promise.all(listed.map((person) => faceIn(ctx, workspace, person))), more });
  const mentions = mentionsOfOnePage(ctx, mentionLookupsAnIssue, "linked");
  const kudosList = async ({ kudos, more }: WeekKudosList): Promise<AlbumWeekKudosList> => ({ kudos: await Promise.all(kudos.map((each) => weekKudosShown(ctx, workspace, mentions, each))), more });
  return {
    ...counts,
    kudosOfWeek: kudosOfWeek === null ? null : await kudosOfTheWeekShown(ctx, workspace, mentions, kudosOfWeek),
    thanked: await people(thanked),
    thankedBy: await people(thankedBy),
    hugged: await people(hugged),
    huggedBy: await people(huggedBy),
    newFaces: await people(newFaces),
    hoggies: hoggiesFound,
    given: await kudosList(given),
    received: await kudosList(received),
  };
}

export async function publicKudosOfTheWeekShown(ctx: QueryContext, workspace: string, pick: NonNullable<Issue["kudosOfWeek"]>): Promise<AlbumIssue["kudosOfWeek"]> {
  if ((await publicKudosOf(ctx, pick.message)) === null) return null;
  return kudosOfTheWeekShown(ctx, workspace, mentionsOfOnePage(ctx, mentionLookupsPerPage, "linked"), pick);
}

async function kudosOfTheWeekShown(ctx: QueryContext, workspace: string, mentions: Mentions, { message, hugs, at }: NonNullable<Issue["kudosOfWeek"]>): Promise<AlbumIssue["kudosOfWeek"]> {
  const given = await givenFactsOf(ctx, message);
  if (given === null || (await takenBackInSlack(ctx, message))) return null;
  return { giver: await faceIn(ctx, workspace, given.giver), ...(await kudosShown(ctx, mentions, message, at)), hugs };
}

async function weekKudosShown(ctx: QueryContext, workspace: string, mentions: Mentions, { message, at, people, morePeople }: WeekKudos): Promise<AlbumWeekKudos> {
  return { message: await kudosWordsOf(ctx, mentions, message), at, people: await Promise.all(people.map((person) => faceIn(ctx, workspace, person))), morePeople };
}

async function kudosShown(ctx: QueryContext, mentions: Mentions, message: MessageRef, at: number): Promise<AlbumKudos> {
  return { message: await kudosWordsOf(ctx, mentions, message), permalink: await permalinkOfMessage(ctx, message), at };
}

export async function faceIn(ctx: QueryContext, workspace: string, person: MemberId): Promise<AlbumPersonFace> {
  const { name, picture } = await nameAndPictureOf(ctx, person);
  return { person, ...companyTeammateOf(name, picture, (await storedCompanyFaceOf(ctx, workspace, person)) ?? null) };
}
