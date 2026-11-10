// The kudos a member gave and received in a week, one entry per message, newest first, for the album's week issue.
// Today's convex/album/weekKudos.ts over the service's transaction.
import { weekOf, type DayKey, type Week } from "../engine/allowance.ts";
import { awardsInWeekNewestDaysFirst, type WeekAward } from "../engine/awards.ts";
import { takenBackInSlack } from "../engine/kudosText.ts";
import { isSameMessage, type MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export const kudosListedAWeek = 50;
export const awardsReadAWeek = 500;
export const peopleNamedAKudos = 3;

type Side = "given" | "received";

export type WeekKudos = { message: MessageRef; at: number; people: MemberId[]; morePeople: number };

export type WeekKudosList = { kudos: WeekKudos[]; more: boolean };

export type WeekKudosLists = { given: WeekKudosList; received: WeekKudosList };

type MessageAwards = { message: MessageRef; at: number; people: MemberId[] };

export async function weekKudosOf(ctx: QueryContext, member: MemberId, week: DayKey, lead: MessageRef | null): Promise<WeekKudosLists> {
  const days = weekOf(week);
  return { given: await kudosListOf(ctx, member, "given", days, lead), received: await kudosListOf(ctx, member, "received", days, lead) };
}

async function kudosListOf(ctx: QueryContext, member: MemberId, side: Side, days: Week, lead: MessageRef | null): Promise<WeekKudosList> {
  const read = await awardsInWeekNewestDaysFirst(ctx, member, side, days, awardsReadAWeek + 1);
  const cutShort = read.at(awardsReadAWeek);
  const messages = messagesOf(read, side);
  if (cutShort !== undefined) messages.delete(keyOf(cutShort.message));
  const listed = await stillInSlack(ctx, newestFirst([...messages.values()]).filter(({ message }) => lead === null || !isSameMessage(message, lead)), kudosListedAWeek + 1);
  return { kudos: listed.slice(0, kudosListedAWeek).map(withAFewNamed), more: cutShort !== undefined || listed.length > kudosListedAWeek };
}

async function stillInSlack(ctx: QueryContext, messages: MessageAwards[], atMost: number): Promise<MessageAwards[]> {
  const kept: MessageAwards[] = [];
  for (const one of messages) {
    if (kept.length === atMost) break;
    if (!(await takenBackInSlack(ctx, one.message))) kept.push(one);
  }
  return kept;
}

function messagesOf(awards: WeekAward[], side: Side): Map<string, MessageAwards> {
  const messages = new Map<string, MessageAwards>();
  for (const { message, giver, recipient, at } of awards) {
    const known = messages.get(keyOf(message)) ?? { message, at, people: [] };
    known.people.unshift(side === "given" ? recipient : giver);
    messages.set(keyOf(message), known);
  }
  return messages;
}

function newestFirst(messages: MessageAwards[]) {
  return messages.toSorted((one, other) => other.at - one.at);
}

function keyOf({ workspace, conversation, message }: MessageRef) {
  return `${workspace}/${conversation}/${message}`;
}

function withAFewNamed({ message, at, people }: MessageAwards): WeekKudos {
  return { message, at, people: people.slice(0, peopleNamedAKudos), morePeople: Math.max(0, people.length - peopleNamedAKudos) };
}
