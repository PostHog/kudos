// The module map's skeleton of convex/stickers/completions.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { KudosGivenEvent } from "../bus/events.ts";
import { awardIdValidator, type AwardId } from "../engine/awards.ts";
import { type MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const completionsPerMutation = 25;

const checkValidator = z.strictObject({ workspace: z.string(), member: zv.id("members"), award: awardIdValidator, at: zv.number() });

export type NewSticker = { member: MemberId; award: AwardId };

export async function checkTeamPagesAfter(ctx: MutationContext, { workspace, at }: KudosGivenEvent, newStickers: NewSticker[]): Promise<void> {
  throw notPorted("stickers.completions.checkTeamPagesAfter");
}

export const checkTeamPagesArgs = z.strictObject({ check: checkValidator });
export async function checkTeamPages(ctx: MutationContext, args: z.infer<typeof checkTeamPagesArgs>): Promise<void> {
  throw notPorted("stickers.completions.checkTeamPages");
}
export const checkTeamPagesJob = mutationJob("stickers.completions.checkTeamPages", checkTeamPagesArgs, checkTeamPages);
