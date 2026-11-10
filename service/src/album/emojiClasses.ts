// A Slack emoji the maintainer classed: a random drop, or left unmapped for good, one row per workspace and name.
// Today's convex/album/emojiClasses.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { emojiClasses, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { allIn, deleteIn, insertInto, patchIn, uniqueIn } from "./rows.ts";

export type EmojiClass = "random" | "unmapped";

export const mostRandomEmojis = 100;

const byWorkspaceName = indexOrder(emojiClasses, ["workspace", "name"]);
const byWorkspaceClass = indexOrder(emojiClasses, ["workspace", "class", "name"]);

export async function emojiClassesIn(ctx: QueryContext, workspace: string): Promise<Map<string, EmojiClass>> {
  const rows = await allIn<Doc<"emojiClasses">>(ctx, emojiClasses, byWorkspaceName, eq(emojiClasses.workspace, workspace));
  return new Map(rows.map(({ name, class: emojiClass }) => [name, emojiClass]));
}

export async function randomEmojiNamesIn(ctx: QueryContext, workspace: string): Promise<string[]> {
  const rows = await allIn<Doc<"emojiClasses">>(ctx, emojiClasses, byWorkspaceClass, and(eq(emojiClasses.workspace, workspace), eq(emojiClasses.class, "random")), mostRandomEmojis);
  return rows.map(({ name }) => name);
}

export async function isClassed(ctx: QueryContext, workspace: string, name: string): Promise<boolean> {
  return (await classOf(ctx, workspace, name)) !== null;
}

export async function classOf(ctx: QueryContext, workspace: string, name: string): Promise<EmojiClass | null> {
  return (await classRowOf(ctx, workspace, name))?.class ?? null;
}

export async function classEmoji(ctx: MutationContext, workspace: string, name: string, emojiClass: EmojiClass): Promise<boolean> {
  const row = await classRowOf(ctx, workspace, name);
  if (row?.class === emojiClass) return true;
  if (emojiClass === "random" && (await randomEmojiNamesIn(ctx, workspace)).length >= mostRandomEmojis) return false;
  if (row === null) await insertInto(ctx, emojiClasses, { workspace, name, class: emojiClass });
  else await patchIn(ctx, emojiClasses, row, { class: emojiClass });
  return true;
}

export async function unclassEmoji(ctx: MutationContext, workspace: string, name: string): Promise<void> {
  const row = await classRowOf(ctx, workspace, name);
  if (row !== null) await deleteIn(ctx, emojiClasses, row);
}

function classRowOf(ctx: QueryContext, workspace: string, name: string) {
  return uniqueIn<Doc<"emojiClasses">>(ctx, emojiClasses, byWorkspaceName, and(eq(emojiClasses.workspace, workspace), eq(emojiClasses.name, name)));
}
