// The module map's skeleton of convex/album/weekKudos.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type DayKey } from "../engine/allowance.ts";
import { type MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const kudosListedAWeek = 50;
export const awardsReadAWeek = 500;
export const peopleNamedAKudos = 3;

export type WeekKudos = { message: MessageRef; at: number; people: MemberId[]; morePeople: number };

export type WeekKudosList = { kudos: WeekKudos[]; more: boolean };

export type WeekKudosLists = { given: WeekKudosList; received: WeekKudosList };

export async function weekKudosOf(ctx: QueryContext, member: MemberId, week: DayKey, lead: MessageRef | null): Promise<WeekKudosLists> {
  throw notPorted("album.weekKudos.weekKudosOf");
}
