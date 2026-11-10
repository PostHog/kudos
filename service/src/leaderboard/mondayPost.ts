// The module map's skeleton of convex/leaderboard/mondayPost.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import { channelRefusalValidator, mondayPostOutcomeValidator, type ChannelCheck } from "./mondayPostOutcome.ts";
import { type TopKudosPost } from "./topKudos.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const mondayPostFlag = { key: "monday-post", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const weeklyPostChannelFlag = { key: "weekly-post-channel", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type MondayPostChange = { on: boolean; timeZone?: string };

export type MondayPostSwitch = { channel: string; channelPicked: boolean; on: boolean; timeZone: string; cantPost: boolean; posts: WeeklyPost["kind"] };

export type ChannelPick = { picked: string | null; check: ChannelCheck | null; pick: number };

export type ChannelPickOutcome = { kind: "checking"; pick: number };

export type WeeklyPostSwitch = MondayPostSwitch & { channelPick?: ChannelPick };

export type PostedGroup = { rank: number; name: string; perMember: number };

export type MondayPost = { kind: "groups"; groups: PostedGroup[]; mostImproved: string | null; givers: number };

export type WeeklyPost = MondayPost | TopKudosPost;

export type ClaimedWeek = { claim: Id<"mondayPostClaims">; channel: string; post: WeeklyPost };

type Switcher = { member: MemberId; timeZone: string | undefined };

type Admin = Switcher & { admin: boolean };

export async function mondayPostSwitchShownTo(ctx: MutationContext, workspace: string, person: Admin): Promise<MondayPostSwitch | null> {
  throw notPorted("leaderboard.mondayPost.mondayPostSwitchShownTo");
}

export async function mondayPostSwitchReadBy(ctx: QueryContext, workspace: string, person: Switcher): Promise<WeeklyPostSwitch | null> {
  throw notPorted("leaderboard.mondayPost.mondayPostSwitchReadBy");
}

export async function setMondayPost(ctx: MutationContext, workspace: string, person: Admin, change: MondayPostChange): Promise<boolean> {
  throw notPorted("leaderboard.mondayPost.setMondayPost");
}

export async function pickMondayPostChannel(ctx: MutationContext, workspace: string, maintainer: Switcher, channel: string): Promise<ChannelPickOutcome | null> {
  throw notPorted("leaderboard.mondayPost.pickMondayPostChannel");
}

export const foundChannelValidator = z.union([z.strictObject({ kind: z.literal("public"), name: z.string() }), z.strictObject({ kind: z.literal("refused"), reason: channelRefusalValidator })]);

export const recordChannelCheckArgs = z.strictObject({ workspace: z.string(), channel: z.string(), pick: zv.number(), found: foundChannelValidator });
export async function recordChannelCheck(ctx: MutationContext, args: z.infer<typeof recordChannelCheckArgs>): Promise<void> {
  throw notPorted("leaderboard.mondayPost.recordChannelCheck");
}

const jobArgs = { workspace: z.string(), generation: zv.number() };

export const bookNextPostArgs = z.strictObject(jobArgs);
export async function bookNextPost(ctx: MutationContext, args: z.infer<typeof bookNextPostArgs>): Promise<void> {
  throw notPorted("leaderboard.mondayPost.bookNextPost");
}

export const claimWeekArgs = z.strictObject(jobArgs);
export async function claimWeek(ctx: MutationContext, args: z.infer<typeof claimWeekArgs>): Promise<null | ClaimedWeek> {
  throw notPorted("leaderboard.mondayPost.claimWeek");
}

export const postAgainLaterArgs = z.strictObject({ ...jobArgs, claim: zv.id("mondayPostClaims"), at: zv.number(), attempt: zv.number() });
export async function postAgainLater(ctx: MutationContext, args: z.infer<typeof postAgainLaterArgs>): Promise<void> {
  throw notPorted("leaderboard.mondayPost.postAgainLater");
}

export const recordOutcomeArgs = z.strictObject({ claim: zv.id("mondayPostClaims"), outcome: mondayPostOutcomeValidator });
export async function recordOutcome(ctx: MutationContext, args: z.infer<typeof recordOutcomeArgs>): Promise<void> {
  throw notPorted("leaderboard.mondayPost.recordOutcome");
}

export async function weeklyPostChannelOf(ctx: QueryContext, workspace: string): Promise<string | null> {
  throw notPorted("leaderboard.mondayPost.weeklyPostChannelOf");
}
