// The module map's skeleton of convex/workspace/customEmoji.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const customEmojiValidator = z.strictObject({ name: z.string(), image: z.string(), aliasOf: z.optional(z.string()) });

export type CustomEmoji = z.infer<typeof customEmojiValidator>;

export type ListedEmoji = { name: string; image: string };

export async function customEmojiImageOf(ctx: QueryContext, workspace: string, name: string): Promise<string | undefined> {
  throw notPorted("workspace.customEmoji.customEmojiImageOf");
}

export async function originalCustomEmojiOf(ctx: QueryContext, workspace: string, name: string): Promise<ListedEmoji | null> {
  throw notPorted("workspace.customEmoji.originalCustomEmojiOf");
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
