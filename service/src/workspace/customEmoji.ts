// The workspace's custom emoji, as Slack's listing gives them. Today's convex/workspace/customEmoji.ts; the reads of one
// emoji by name are ported, and the stubs left throw notPorted until the custom emoji sync's slice ports them.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { indexOrder } from "../db/indexOrder.ts";
import { customEmoji, type Doc } from "../db/schema/index.ts";
import { uniqueRow } from "./rows.ts";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const customEmojiValidator = z.strictObject({ name: z.string(), image: z.string(), aliasOf: z.optional(z.string()) });

export type CustomEmoji = z.infer<typeof customEmojiValidator>;

export type ListedEmoji = { name: string; image: string };

export async function customEmojiImageOf(ctx: QueryContext, workspace: string, name: string): Promise<string | undefined> {
  return (await emojiRow(ctx, workspace, name))?.image;
}

export async function originalCustomEmojiOf(ctx: QueryContext, workspace: string, name: string): Promise<ListedEmoji | null> {
  const row = await emojiRow(ctx, workspace, name);
  return row === null ? null : { name: row.aliasOf ?? row.name, image: row.image };
}

export async function originalCustomEmojiStartingWith(ctx: QueryContext, workspace: string, typed: string, limit: number): Promise<ListedEmoji[]> {
  throw notPorted("workspace.customEmoji.originalCustomEmojiStartingWith");
}

export async function customEmojiListedIn(ctx: QueryContext, workspace: string, most: number): Promise<ListedEmoji[]> {
  throw notPorted("workspace.customEmoji.customEmojiListedIn");
}

export async function customEmojiScopeMissingIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("workspace.customEmoji.customEmojiScopeMissingIn");
}

export async function claimCustomEmojiRefresh(ctx: MutationContext, workspace: string, inMs: number): Promise<boolean> {
  throw notPorted("workspace.customEmoji.claimCustomEmojiRefresh");
}

export const beginCustomEmojiListingArgs = z.strictObject({ workspace: z.string() });
export async function beginCustomEmojiListing(ctx: MutationContext, args: z.infer<typeof beginCustomEmojiListingArgs>): Promise<number> {
  throw notPorted("workspace.customEmoji.beginCustomEmojiListing");
}

export const keepCustomEmojiArgs = z.strictObject({ workspace: z.string(), emoji: z.array(customEmojiValidator), listing: zv.number(), scopeMissing: z.optional(z.boolean()) });
export async function keepCustomEmoji(ctx: MutationContext, args: z.infer<typeof keepCustomEmojiArgs>): Promise<boolean> {
  throw notPorted("workspace.customEmoji.keepCustomEmoji");
}

export const forgetUnlistedCustomEmojiArgs = z.strictObject({ workspace: z.string(), listing: zv.number() });
export async function forgetUnlistedCustomEmoji(ctx: MutationContext, args: z.infer<typeof forgetUnlistedCustomEmojiArgs>): Promise<void> {
  throw notPorted("workspace.customEmoji.forgetUnlistedCustomEmoji");
}
export const forgetUnlistedCustomEmojiJob = mutationJob("workspace.customEmoji.forgetUnlistedCustomEmoji", forgetUnlistedCustomEmojiArgs, forgetUnlistedCustomEmoji);

const byName = indexOrder(customEmoji, ["workspace", "name"]);

function emojiRow(ctx: QueryContext, workspace: string, name: string): Promise<Doc<"customEmoji"> | null> {
  return uniqueRow<Doc<"customEmoji">>(ctx, customEmoji, and(eq(customEmoji.workspace, workspace), eq(customEmoji.name, name)), byName);
}
