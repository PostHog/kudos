import type { MutationCtx } from "../_generated/server";
import type { MemberId } from "../workspace/directory";
import { settingsOf } from "../workspace/settings";
import { thoughtfulKudos } from "../progression/gate";
import { ownedKudosEmojiHook } from "../store/inventory";
import { earnedEmojiHook } from "../album/kudosEmojis";
import type { Annotations, ChatUserId, CountableContent, Mention, MessageContent } from "../engine/messageEvent";

export type ParseContext = { workspace: string; giver: MemberId | undefined };

export type ParseHook = {
  name: string;
  kudosEmoji?(ctx: MutationCtx, context: ParseContext, content: CountableContent): Promise<KudosEmojiClaim[]>;
  annotate?(content: MessageContent, context: ParseContext): Annotations;
};

export type KudosEmojiClaim = { name: string; onlyFor?: ChatUserId };

export type KudosMessage = { mentions: Mention[]; kudosEmoji: PlacedEmoji[]; ownedEmoji: string[] };

type PlacedEmoji = { name: string; mentionsBefore: number | undefined; countsFor: (user: ChatUserId) => boolean };

const workspaceEmoji: ParseHook = {
  name: "workspace emoji",
  kudosEmoji: async (ctx, { workspace }) => [{ name: (await settingsOf(ctx, workspace)).kudosEmoji }],
};

export const parseHooks: ParseHook[] = [workspaceEmoji, ownedKudosEmojiHook, earnedEmojiHook, thoughtfulKudos];

export async function kudosMessageOf(ctx: MutationCtx, content: CountableContent, context: ParseContext): Promise<KudosMessage | null> {
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
  return mostRepeatsIn(kudosEmoji.filter(({ countsFor }) => countsFor(user)).map(({ name }) => name));
}

export function kudosEmojiClosestAfter({ kudosEmoji, mentions }: KudosMessage, user: ChatUserId): string {
  const mention = mentions.findIndex((mentioned) => mentioned.kind === "person" && mentioned.user === user);
  const counting = kudosEmoji.filter(({ countsFor }) => countsFor(user));
  const placed = counting.filter((emoji): emoji is PlacedEmoji & { mentionsBefore: number } => emoji.mentionsBefore !== undefined);
  const after = placed.find(({ mentionsBefore }) => mentionsBefore > mention);
  const before = placed.findLast(({ mentionsBefore }) => mentionsBefore <= mention);
  return (after ?? before ?? counting[0]!).name;
}

function mostRepeatsIn(names: string[]) {
  return Math.max(0, ...[...new Set(names)].map((name) => names.filter((other) => other === name).length));
}

export function annotationsOf(content: MessageContent, context: ParseContext): Annotations {
  return Object.assign({}, ...parseHooks.map((hook) => hook.annotate?.(content, context) ?? {}));
}

export async function fingerprintOf(ctx: MutationCtx, content: CountableContent, context: ParseContext): Promise<string> {
  const mentions = [...new Set(content.mentions.map((mention) => JSON.stringify(mention)))].sort();
  const kudosEmoji = (await kudosEmojiIn(ctx, content, context)).sort();
  return JSON.stringify({ mentions, kudosEmoji });
}

async function kudosEmojiIn(ctx: MutationCtx, content: CountableContent, context: ParseContext) {
  return claimedIn(content, await claimsOf(ctx, content, context));
}

type Claim = { hook: ParseHook; claimed: KudosEmojiClaim[] };

function claimsOf(ctx: MutationCtx, content: CountableContent, context: ParseContext): Promise<Claim[]> {
  return Promise.all(parseHooks.map(async (hook) => ({ hook, claimed: await (hook.kudosEmoji?.(ctx, context, content) ?? []) })));
}

function placedIn({ emoji, mentionsBeforeEmoji }: CountableContent, claims: Claim[]): PlacedEmoji[] {
  const byName = claimsByName(claims);
  return emoji.flatMap((name, index) => {
    const ofName = byName.get(name);
    if (ofName === undefined) return [];
    const countsFor = (user: ChatUserId) => ofName.some(({ onlyFor }) => onlyFor === undefined || onlyFor === user);
    return [{ name, mentionsBefore: mentionsBeforeEmoji?.[index], countsFor }];
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
