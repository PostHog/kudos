// The module map's skeleton of convex/workspace/slackEmoji.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import { type ListedEmoji } from "./customEmoji.ts";
import type { MemberId } from "./directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type SlackEmoji = ListedEmoji;

export type SlackEmojiReach = "custom" | "customAndStandard";

const skinToneSuffix = /::skin-tone-[2-6]$/;

export const standardEmojiFlag = { key: "standard-emoji", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function slackEmojiReachOf(ctx: QueryContext, member: MemberId): Promise<SlackEmojiReach> {
  throw notPorted("workspace.slackEmoji.slackEmojiReachOf");
}

export function withoutSkinTone(emoji: string): string {
  return emoji.replace(skinToneSuffix, "");
}

export async function slackEmojiImageOf(ctx: QueryContext, workspace: string, name: string): Promise<string | undefined> {
  throw notPorted("workspace.slackEmoji.slackEmojiImageOf");
}

export async function slackEmojiNamed(ctx: QueryContext, workspace: string, name: string, reach: SlackEmojiReach): Promise<SlackEmoji | null> {
  throw notPorted("workspace.slackEmoji.slackEmojiNamed");
}

export async function slackEmojiStartingWith(ctx: QueryContext, workspace: string, typed: string, limit: number, reach: SlackEmojiReach): Promise<SlackEmoji[]> {
  throw notPorted("workspace.slackEmoji.slackEmojiStartingWith");
}

export async function slackEmojiListedIn(ctx: QueryContext, workspace: string, most: number, reach: SlackEmojiReach): Promise<SlackEmoji[]> {
  throw notPorted("workspace.slackEmoji.slackEmojiListedIn");
}
