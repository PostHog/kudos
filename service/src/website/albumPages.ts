// The module map's skeleton of convex/website/albumPages.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Message } from "../activity/entries.ts";
import { type HypeEmoji, type PersonTeam } from "../album/personPage.ts";
import type { HoggieFound } from "../album/records.ts";
import { type Issue, type WeekTab } from "../album/weekIssue.ts";
import type { DayKey } from "../engine/allowance.ts";
import { type MemberId } from "../workspace/directory.ts";
import { type Face } from "./faces.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type AlbumPersonFace = { person: MemberId; name: string; face: Face };

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
  throw notPorted("website.albumPages.albumPersonOf");
}

export async function albumWeekOf(ctx: QueryContext, me: VerifiedMember, asked: DayKey | undefined): Promise<AlbumWeekAnswer> {
  throw notPorted("website.albumPages.albumWeekOf");
}

export async function albumProfileOf(ctx: QueryContext, me: VerifiedMember, peopleSearched: number): Promise<AlbumProfileAnswer> {
  throw notPorted("website.albumPages.albumProfileOf");
}

export async function publicKudosOfTheWeekShown(ctx: QueryContext, workspace: string, pick: NonNullable<Issue["kudosOfWeek"]>): Promise<AlbumIssue["kudosOfWeek"]> {
  throw notPorted("website.albumPages.publicKudosOfTheWeekShown");
}

export async function faceIn(ctx: QueryContext, workspace: string, person: MemberId): Promise<AlbumPersonFace> {
  throw notPorted("website.albumPages.faceIn");
}
