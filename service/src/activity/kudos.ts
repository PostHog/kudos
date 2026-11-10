// The module map's skeleton of convex/activity/kudos.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { AwardId } from "../engine/awards.ts";
import type { MessageRef, WordSegment } from "../engine/messageEvent.ts";
import { type MemberId } from "../workspace/directory.ts";
import type { Channel, Message, Person, Segment } from "./entries.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type KudosFacts = { channel: Channel; saidWhy: boolean | null; permalink: string | null; message: Message };
const broadcastRanges = ["here", "channel", "everyone"] as const;

export const mentionLookupsPerPage = 2_000;

type PersonMentioned = Extract<Segment, { kind: "person" }>;

export type Mentions = {
  person: (workspace: string, user: string) => Promise<PersonMentioned>;
  groupHandle: (workspace: string, group: string) => Promise<string>;
  emojiImage: (workspace: string, name: string) => Promise<string | undefined>;
};

export type PeopleMentioned = "named" | "linked";

export function mentionsOfOnePage(ctx: QueryContext, lookupsAtMost = mentionLookupsPerPage, people: PeopleMentioned = "named"): Mentions {
  throw notPorted("activity.kudos.mentionsOfOnePage");
}

export async function kudosFactsOf(ctx: QueryContext, mentions: Mentions, ref: MessageRef, first: AwardId): Promise<KudosFacts> {
  throw notPorted("activity.kudos.kudosFactsOf");
}

export async function personOf(ctx: QueryContext, member: MemberId): Promise<Person> {
  throw notPorted("activity.kudos.personOf");
}

export async function kudosWordsOf(ctx: QueryContext, mentions: Mentions, ref: MessageRef): Promise<Message> {
  throw notPorted("activity.kudos.kudosWordsOf");
}

export async function kudosWordsStillInSlack(ctx: QueryContext, mentions: Mentions, message: MessageRef): Promise<Message | null> {
  throw notPorted("activity.kudos.kudosWordsStillInSlack");
}

export function readableSegmentsOf(mentions: Mentions, workspace: string, segments: WordSegment[]): Promise<Segment[]> {
  return Promise.all(segments.map((segment) => readableSegmentOf(mentions, workspace, segment)));
}

async function readableSegmentOf(mentions: Mentions, workspace: string, segment: WordSegment): Promise<Segment> {
  switch (segment.kind) {
    case "person":
      return mentions.person(workspace, segment.user);
    case "group":
      return { kind: "group", handle: await mentions.groupHandle(workspace, segment.group) };
    case "broadcast":
      return broadcastSegmentOf(segment.range);
    case "emoji":
      return segment.unicode === undefined ? withImageOf(mentions, workspace, segment) : segment;
    default:
      return segment;
  }
}

async function withImageOf(mentions: Mentions, workspace: string, segment: Extract<WordSegment, { kind: "emoji" }>): Promise<Segment> {
  const image = await mentions.emojiImage(workspace, segment.name);
  return image === undefined ? segment : { ...segment, image };
}

function broadcastSegmentOf(range: string): Segment {
  const known = broadcastRanges.find((broadcast) => broadcast === range);
  return known === undefined ? { kind: "text", text: `@${range}` } : { kind: "broadcast", range: known };
}

export async function permalinkOfMessage(ctx: QueryContext, ref: MessageRef): Promise<string | null> {
  throw notPorted("activity.kudos.permalinkOfMessage");
}
