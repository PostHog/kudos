// The quests panel's read and its view report: today's convex/website/quests.ts as plain website handlers, which S17's
// route list registers as `website.quests.getQuests` and `website.quests.viewQuests`.
import { z } from "zod";
import { reportQuestsViewed } from "../analytics/isolatedUsage.ts";
import { questsSurfaceValidator } from "../analytics/projections.ts";
import type { HomeMember } from "../feedback/homes.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { onTheMondayPath } from "../quests/flag.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { mondayQuestsOf, type MondayQuests } from "./mondayQuests.ts";

export type { DrawnQuest, GettingStartedStep, MondayQuests, QuestItemState, SideQuest } from "./mondayQuests.ts";

export type QuestsAnswer = MondayQuests | { kind: "not-found" };

export type QuestsViewAnswer = { kind: "viewed" } | { kind: "refused" };

const notFound = { kind: "not-found" } as const;

export const getQuestsArgs = {};

export async function getQuests(ctx: QueryContext, me: VerifiedMember): Promise<QuestsAnswer> {
  if (!(await onTheMondayPath(ctx, me.member))) return notFound;
  const monday = await mondayQuestsOf(ctx, me);
  return monday.quests.kind === "two-quests" && monday.quests.quests.length === 0 ? notFound : monday;
}

export const viewQuestsArgs = { surface: questsSurfaceValidator };

export async function viewQuests(ctx: MutationContext, me: VerifiedMember, _person: HomeMember, { surface }: { surface: z.infer<typeof questsSurfaceValidator> }): Promise<QuestsViewAnswer> {
  if (!(await onTheMondayPath(ctx, me.member))) return { kind: "refused" };
  await reportQuestsViewed(ctx, { workspace: me.workspace, member: me.member, surface, at: ctx.now });
  return { kind: "viewed" };
}
