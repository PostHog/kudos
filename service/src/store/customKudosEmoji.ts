// The module map's skeleton of convex/store/customKudosEmoji.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import { type SlackEmojiReach } from "../workspace/slackEmoji.ts";
import { type StoreItem } from "./catalogue.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type CustomKudosEmojiPicker = { kind: "reinstall" } | { kind: "pick"; picked: string[]; reach: SlackEmojiReach };

export type CustomItems = { all: StoreItem[]; picked: StoreItem[] };

type Admin = { member: MemberId; admin: boolean };

export const customKudosEmojiPerWorkspace = 20;

export const customKudosEmojiOptionsArgs = z.strictObject({ workspace: z.string(), user: z.string(), typed: z.string() });
export async function customKudosEmojiOptions(ctx: QueryContext, args: z.infer<typeof customKudosEmojiOptionsArgs>): Promise<string[]> {
  throw notPorted("store.customKudosEmoji.customKudosEmojiOptions");
}

export async function customKudosEmojiShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("store.customKudosEmoji.customKudosEmojiShownTo");
}

export async function customKudosEmojiShownAndExposedTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("store.customKudosEmoji.customKudosEmojiShownAndExposedTo");
}

export async function customKudosEmojiOnAndExposedFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("store.customKudosEmoji.customKudosEmojiOnAndExposedFor");
}

export async function customItemsShownTo(ctx: QueryContext, member: MemberId): Promise<CustomItems> {
  throw notPorted("store.customKudosEmoji.customItemsShownTo");
}

export async function customItemsShownAndExposedTo(ctx: MutationContext, member: MemberId): Promise<CustomItems> {
  throw notPorted("store.customKudosEmoji.customItemsShownAndExposedTo");
}

export async function customKudosEmojiPickerFor(ctx: MutationContext, workspace: string, person: Admin): Promise<CustomKudosEmojiPicker | null> {
  throw notPorted("store.customKudosEmoji.customKudosEmojiPickerFor");
}

export async function setCustomKudosEmoji(ctx: MutationContext, workspace: string, person: Admin, names: string[]): Promise<boolean> {
  throw notPorted("store.customKudosEmoji.setCustomKudosEmoji");
}
