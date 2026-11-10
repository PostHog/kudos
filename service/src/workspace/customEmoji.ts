// The workspace's custom emoji, as Slack's listing gives them, and each workspace's listings: today's
// convex/workspace/customEmoji.ts. Each listing is numbered; a write from an older listing is refused, an emoji is kept
// by name, and the emoji a listing didn't keep are forgotten only by the listing that wrote last.
import { and, eq, gte, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { indexOrder, type IndexOrder } from "../db/indexOrder.ts";
import { customEmoji, customEmojiListings, type Doc } from "../db/schema/index.ts";
import { insertRow, patchRow, uniqueRow } from "./rows.ts";
import { zv } from "../values.ts";
import { toDocument } from "../db/documents.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
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
  const rows = await emojiRows(ctx, and(eq(customEmoji.workspace, workspace), gte(customEmoji.name, typed), lt(customEmoji.name, `${typed}\uffff`)), byName, limit * 2);
  const originals = new Map(rows.map(({ name, image, aliasOf }) => [aliasOf ?? name, { name: aliasOf ?? name, image }]));
  return [...originals.values()].toSorted((first, second) => first.name.localeCompare(second.name)).slice(0, limit);
}

export async function customEmojiListedIn(ctx: QueryContext, workspace: string, most: number): Promise<ListedEmoji[]> {
  const rows = await emojiRows(ctx, eq(customEmoji.workspace, workspace), byName, most);
  return rows.map(({ name, image }) => ({ name, image }));
}

export async function customEmojiScopeMissingIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  return (await listingsRow(ctx, workspace))?.scopeMissing === true;
}

export async function claimCustomEmojiRefresh(ctx: MutationContext, workspace: string, inMs: number): Promise<boolean> {
  const listings = await listingsRow(ctx, workspace);
  if (listings?.refreshDueAt !== undefined && listings.refreshDueAt > ctx.now) return false;
  const refreshDueAt = ctx.now + inMs;
  if (listings === null) await insertRow(ctx, customEmojiListings, { workspace, begun: 0, refreshDueAt });
  else await patchRow(ctx, customEmojiListings, listings._id, { refreshDueAt });
  return true;
}

export const beginCustomEmojiListingArgs = z.strictObject({ workspace: z.string() });
export async function beginCustomEmojiListing(ctx: MutationContext, { workspace }: z.infer<typeof beginCustomEmojiListingArgs>): Promise<number> {
  const listings = await listingsRow(ctx, workspace);
  if (listings === null) {
    await insertRow(ctx, customEmojiListings, { workspace, begun: 1 });
    return 1;
  }
  await patchRow(ctx, customEmojiListings, listings._id, { begun: listings.begun + 1 });
  return listings.begun + 1;
}

export const keepCustomEmojiArgs = z.strictObject({ workspace: z.string(), emoji: z.array(customEmojiValidator), listing: zv.number(), scopeMissing: z.optional(z.boolean()) });
export async function keepCustomEmoji(ctx: MutationContext, { workspace, emoji, listing, scopeMissing }: z.infer<typeof keepCustomEmojiArgs>): Promise<boolean> {
  const listings = await listingsRow(ctx, workspace);
  if (listings === null || (listings.written ?? 0) > listing) return false;
  if (listings.written !== listing || listings.scopeMissing !== scopeMissing) await patchRow(ctx, customEmojiListings, listings._id, { written: listing, scopeMissing });
  for (const listed of emoji) await keepOne(ctx, workspace, listed, listing);
  return true;
}

export const forgetUnlistedCustomEmojiArgs = z.strictObject({ workspace: z.string(), listing: zv.number() });
/** Forgets the emoji an earlier listing kept and the one that wrote last didn't, 1,000 a run; a full run asks for another. */
export async function forgetUnlistedCustomEmoji(ctx: MutationContext, { workspace, listing }: z.infer<typeof forgetUnlistedCustomEmojiArgs>): Promise<void> {
  if ((await listingsRow(ctx, workspace))?.written !== listing) return;
  const unlisted = await emojiRows(ctx, and(eq(customEmoji.workspace, workspace), lt(customEmoji.listing, listing)), byListing, forgottenPerRun);
  for (const row of unlisted) await ctx.tx.delete(customEmoji).where(eq(customEmoji._id, row._id));
  if (unlisted.length === forgottenPerRun) await ctx.jobs.enqueue(forgetUnlistedCustomEmojiJob, { workspace, listing }, { after: 0 });
}
export const forgetUnlistedCustomEmojiJob = mutationJob("workspace.customEmoji.forgetUnlistedCustomEmoji", forgetUnlistedCustomEmojiArgs, forgetUnlistedCustomEmoji);

async function keepOne(ctx: MutationContext, workspace: string, { name, image, aliasOf }: CustomEmoji, listing: number) {
  const row = await emojiRow(ctx, workspace, name);
  if (row === null) await insertRow(ctx, customEmoji, { workspace, name, image, aliasOf, listing });
  else await patchRow(ctx, customEmoji, row._id, { image, aliasOf, listing });
}

const forgottenPerRun = 1_000;
const byName = indexOrder(customEmoji, ["workspace", "name"]);
const byListing = indexOrder(customEmoji, ["workspace", "listing"]);
const listingsByWorkspace = indexOrder(customEmojiListings, ["workspace"]);

function emojiRow(ctx: QueryContext, workspace: string, name: string): Promise<Doc<"customEmoji"> | null> {
  return uniqueRow<Doc<"customEmoji">>(ctx, customEmoji, and(eq(customEmoji.workspace, workspace), eq(customEmoji.name, name)), byName);
}

function emojiRows(ctx: QueryContext, where: SQL | undefined, order: IndexOrder, most: number): Promise<Doc<"customEmoji">[]> {
  return ctx.tx
    .select()
    .from(customEmoji)
    .where(where)
    .orderBy(...order.orderBy())
    .limit(most)
    .then((rows) => rows.map((row) => toDocument<Doc<"customEmoji">>(customEmoji, row)));
}

function listingsRow(ctx: QueryContext, workspace: string): Promise<Doc<"customEmojiListings"> | null> {
  return uniqueRow<Doc<"customEmojiListings">>(ctx, customEmojiListings, eq(customEmojiListings.workspace, workspace), listingsByWorkspace);
}
