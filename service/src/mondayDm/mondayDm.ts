// The module map's skeleton of convex/mondayDm/mondayDm.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DayKey } from "../engine/allowance.ts";
import type { DmLinks } from "../feedback/dmLinks.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QuestsCopy } from "./questsCopy.ts";
import type { MondayDmContent } from "./records.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type MondayQuests = QuestsCopy & { waiting: boolean; links: DmLinks | null };

export type MondayDm = { dm: Id<"mondayDms">; workspace: string; user: string; nudge: string | null } & MondayDmContent;

export const ensureMondayDmsArgs = z.strictObject({ cursor: z.optional(z.string()) });
export async function ensureMondayDms(ctx: MutationContext, args: z.infer<typeof ensureMondayDmsArgs>): Promise<void> {
  throw notPorted("mondayDm.mondayDm.ensureMondayDms");
}
export const ensureMondayDmsJob = mutationJob("mondayDm.mondayDm.ensureMondayDms", ensureMondayDmsArgs, ensureMondayDms);

const tryArgs = { dm: zv.id("mondayDms"), attempt: zv.number() };

export const startMondayDmArgs = z.strictObject(tryArgs);
export async function startMondayDm(ctx: MutationContext, args: z.infer<typeof startMondayDmArgs>): Promise<null | { dm: Id<"mondayDms">; workspace: string; user: string; nudge: null | string } & { hugs: null | { lines: (string | { text: string; link: { url: string; label: string } })[]; closing: (string | { text: string; link: { url: string; label: string } })[]; emojiLine: null | { text: string; pictures: { name: string; url: string }[] } }; quests: null | { heading: string; checklist: { howTo?: string; reward?: string; goal: string; mark: "done" | "next" | "open"; progress: null | string }[]; waiting: boolean; links: null | { quests: string; book: string } }; footer: null | { appHome: string; rest: string } }> {
  throw notPorted("mondayDm.mondayDm.startMondayDm");
}

export const mondayDmLaterArgs = z.strictObject({ ...tryArgs, retry: z.strictObject({ at: zv.number(), attempt: zv.number() }) });
export async function mondayDmLater(ctx: MutationContext, args: z.infer<typeof mondayDmLaterArgs>): Promise<void> {
  throw notPorted("mondayDm.mondayDm.mondayDmLater");
}

export const mondayDmEndedArgs = z.strictObject({ ...tryArgs, outcome: z.union([z.literal("delivered"), z.literal("gone"), z.literal("failed")]) });
export async function mondayDmEnded(ctx: MutationContext, args: z.infer<typeof mondayDmEndedArgs>): Promise<void> {
  throw notPorted("mondayDm.mondayDm.mondayDmEnded");
}

export async function ensureMondayDmOn(ctx: MutationContext, member: MemberId, monday: DayKey): Promise<void> {
  throw notPorted("mondayDm.mondayDm.ensureMondayDmOn");
}
