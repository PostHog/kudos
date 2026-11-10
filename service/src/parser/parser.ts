// The module map's skeleton of convex/parser/parser.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { Annotations, ChatUserId, CountableContent, Mention, MessageContent } from "../engine/messageEvent.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted, notPortedValue } from "../notPorted.ts";

export type ParseContext = { workspace: string; giver: MemberId | undefined };

export type ParseHook = {
  name: string;
  kudosEmoji?(ctx: MutationContext, context: ParseContext, content: CountableContent): Promise<KudosEmojiClaim[]>;
  annotate?(content: MessageContent, context: ParseContext): Annotations;
};

export type KudosEmojiClaim = { name: string; onlyFor?: ChatUserId };

export type KudosMessage = { mentions: Mention[]; kudosEmoji: PlacedEmoji[]; ownedEmoji: string[] };

type PlacedEmoji = { name: string; mentionsBefore: number | undefined; claims: KudosEmojiClaim[] };

export const parseHooks: ParseHook[] = notPortedValue("parser.parser.parseHooks");

export async function kudosMessageOf(ctx: MutationContext, content: CountableContent, context: ParseContext): Promise<KudosMessage | null> {
  throw notPorted("parser.parser.kudosMessageOf");
}

export function mostKudosIn({ kudosEmoji }: KudosMessage): number {
  return mostRepeatsIn(kudosEmoji.map(({ name }) => name));
}

export function kudosFor({ kudosEmoji }: KudosMessage, user: ChatUserId): number {
  return mostRepeatsIn(countingFor(kudosEmoji, user).map(({ name }) => name));
}

export function kudosEmojiClosestAfter({ kudosEmoji, mentions }: KudosMessage, user: ChatUserId): string {
  const mention = mentions.findIndex((mentioned) => mentioned.kind === "person" && mentioned.user === user);
  const counting = countingFor(kudosEmoji, user);
  const placed = counting.filter((emoji): emoji is PlacedEmoji & { mentionsBefore: number } => emoji.mentionsBefore !== undefined);
  const after = placed.find(({ mentionsBefore }) => mentionsBefore > mention);
  const before = placed.findLast(({ mentionsBefore }) => mentionsBefore <= mention);
  return (after ?? before ?? counting[0]!).name;
}

function countingFor(kudosEmoji: PlacedEmoji[], user: ChatUserId) {
  return kudosEmoji.filter(({ claims }) => claims.some(({ onlyFor }) => onlyFor === undefined || onlyFor === user));
}

function mostRepeatsIn(names: string[]) {
  return Math.max(0, ...[...new Set(names)].map((name) => names.filter((other) => other === name).length));
}

export function annotationsOf(content: MessageContent, context: ParseContext): Annotations {
  throw notPorted("parser.parser.annotationsOf");
}

export async function fingerprintOf(ctx: MutationContext, content: CountableContent, context: ParseContext): Promise<string> {
  throw notPorted("parser.parser.fingerprintOf");
}
