// The parser, as today's convex/parser/parser.ts: whether a message is a kudos message, which kudos emoji it carries
// and for whom, and what the parse hooks note about it. Each hook names the kudos emoji it knows of (the workspace's
// own, owned store emoji, earned album emoji), and the thoughtful-kudos gate annotates.
import { earnedEmojiHook } from "../album/kudosEmojis.ts";
import type { Annotations, ChatUserId, CountableContent, Mention, MessageContent } from "../engine/messageEvent.ts";
import type { MutationContext } from "../operations.ts";
import { thoughtfulKudos } from "../progression/gate.ts";
import { ownedKudosEmojiHook } from "../store/inventory.ts";
import type { MemberId } from "../workspace/directory.ts";
import { settingsOf } from "../workspace/settings.ts";

export type ParseContext = { workspace: string; giver: MemberId | undefined };

export type ParseHook = {
  name: string;
  kudosEmoji?(ctx: MutationContext, context: ParseContext, content: CountableContent): Promise<KudosEmojiClaim[]>;
  annotate?(content: MessageContent, context: ParseContext): Annotations;
};

export type KudosEmojiClaim = { name: string; onlyFor?: ChatUserId };

export type KudosMessage = { mentions: Mention[]; kudosEmoji: PlacedEmoji[]; ownedEmoji: string[] };

type PlacedEmoji = { name: string; mentionsBefore: number | undefined; claims: KudosEmojiClaim[] };

const workspaceEmoji: ParseHook = {
  name: "workspace emoji",
  kudosEmoji: async (ctx, { workspace }) => [{ name: (await settingsOf(ctx, workspace)).kudosEmoji }],
};

export const parseHooks: ParseHook[] = [workspaceEmoji, ownedKudosEmojiHook, earnedEmojiHook, thoughtfulKudos];

export async function kudosMessageOf(ctx: MutationContext, content: CountableContent, context: ParseContext): Promise<KudosMessage | null> {
  if (content.mentions.length === 0) return null;
  const claims = await claimsOf(ctx, content, context);
  const kudosEmoji = placedIn(content, claims);
  if (kudosEmoji.length === 0) return null;
  const ownedEmoji = [...new Set(claimedIn(content, claims.filter(({ hook }) => hook === ownedKudosEmojiHook)))];
  return { mentions: content.mentions, kudosEmoji, ownedEmoji };
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
  return Object.assign({}, ...parseHooks.map((hook) => hook.annotate?.(content, context) ?? {}));
}

export async function fingerprintOf(ctx: MutationContext, content: CountableContent, context: ParseContext): Promise<string> {
  const mentions = [...new Set(content.mentions.map((mention) => JSON.stringify(mention)))].sort();
  const kudosEmoji = (await kudosEmojiIn(ctx, content, context)).sort();
  return JSON.stringify({ mentions, kudosEmoji });
}

async function kudosEmojiIn(ctx: MutationContext, content: CountableContent, context: ParseContext) {
  return claimedIn(content, await claimsOf(ctx, content, context));
}

type Claim = { hook: ParseHook; claimed: KudosEmojiClaim[] };

function claimsOf(ctx: MutationContext, content: CountableContent, context: ParseContext): Promise<Claim[]> {
  return Promise.all(parseHooks.map(async (hook) => ({ hook, claimed: await (hook.kudosEmoji?.(ctx, context, content) ?? []) })));
}

function placedIn({ emoji, mentionsBeforeEmoji }: CountableContent, claims: Claim[]): PlacedEmoji[] {
  const byName = claimsByName(claims);
  return emoji.flatMap((name, index) => {
    const claims = byName.get(name);
    return claims === undefined ? [] : [{ name, mentionsBefore: mentionsBeforeEmoji?.[index], claims }];
  });
}

function claimedIn({ emoji }: CountableContent, claims: Claim[]) {
  const byName = claimsByName(claims);
  return emoji.filter((name) => byName.has(name));
}

function claimsByName(claims: Claim[]) {
  const byName = new Map<string, KudosEmojiClaim[]>();
  for (const claim of claims.flatMap(({ claimed }) => claimed)) byName.set(claim.name, [...(byName.get(claim.name) ?? []), claim]);
  return byName;
}
