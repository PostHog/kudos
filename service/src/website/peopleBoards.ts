// The module map's skeleton of convex/website/peopleBoards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DayKey } from "../engine/allowance.ts";
import type { BoardViewer } from "../leaderboard/boards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Face } from "./faces.ts";
import { z } from "zod";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const hugMeasureValidator = z.union([z.literal("hugsGiven"), z.literal("hugsReceived"), z.literal("kudosReceived"), z.literal("level"), z.literal("hoggies")]);

export type HugMeasure = z.infer<typeof hugMeasureValidator>;

export type PersonRow = { person: MemberId; rank: number | null; name: string; face: Face; figure: number; you: boolean };

export type PeopleBoard = { rows: PersonRow[]; lastWeek: PersonRow[] | null };

export type TeamBoard = { name: string; rows: PersonRow[]; joinedIn: boolean; yetToJoin: number };

export type PeopleBoards = { measure: HugMeasure; people: PeopleBoard; team: TeamBoard | null };

export type BoardWeeks = { thisWeek: DayKey; lastWeek: DayKey };

export async function peopleBoardsOf(ctx: QueryContext, viewer: BoardViewer, measure: HugMeasure, weeks: BoardWeeks): Promise<PeopleBoards> {
  throw notPorted("website.peopleBoards.peopleBoardsOf");
}
