// The module map's skeleton of convex/commands/commands.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { pickSurfaceValidator } from "../analytics/isolatedUsage.ts";
import { homeTabValidator, type HomeMember } from "../feedback/homes.ts";
import { groupModeValidator } from "../groups/mode.ts";
import type { ChannelPickOutcome } from "../leaderboard/mondayPost.ts";
import { periodValidator } from "../leaderboard/periods.ts";
import { messageKindValidator, messagePlaceValidator } from "../messageSettings/kinds.ts";
import type { PurchaseOutcome } from "../progression/purchases.ts";
import { perkValidator } from "../progression/tree.ts";
import type { AdminLinkOutcome } from "../companyProfiles/admin.ts";
import type { SelfLinkOutcome } from "../companyProfiles/links.ts";
import type { CratePurchaseOutcome } from "../album/hoggies/records.ts";
import type { ItemPurchaseOutcome } from "../store/rows.ts";
import type { PressedIn } from "../mondayDm/stop.ts";
import type { Surface } from "./surface.ts";
import { featureValidator } from "../unlocks/feature.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { WorkspaceSettingsOutcome } from "../workspace/workspaceSettings.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const commandValidator = z.union([
  z.strictObject({ type: z.literal("showHomeTab"), tab: homeTabValidator }),
  z.strictObject({ type: z.literal("showLeaderboard"), period: periodValidator }),
  z.strictObject({ type: z.literal("setLeaderboardVisibility"), visible: z.boolean() }),
  z.strictObject({ type: z.literal("setProgressSettings"), muteNotices: z.optional(z.boolean()), dms: z.optional(z.boolean()) }),
  z.strictObject({ type: z.literal("setMessageSetting"), kind: messageKindValidator, place: messagePlaceValidator }),
  z.strictObject({ type: z.literal("setMessageSetting"), kind: messageKindValidator, on: z.boolean() }),
  z.strictObject({ type: z.literal("setAnnouncementChannel"), channel: z.union([z.string(), z.null()]) }),
  z.strictObject({ type: z.literal("openUnlock"), feature: featureValidator }),
  z.strictObject({ type: z.literal("buyPerk"), perk: perkValidator }),
  z.strictObject({ type: z.literal("pickPrimaryGroup"), group: z.string(), surface: pickSurfaceValidator }),
  z.strictObject({ type: z.literal("setGroupMode"), mode: groupModeValidator, allowlist: z.optional(z.array(z.string())) }),
  z.strictObject({ type: z.literal("setMondayPost"), on: z.boolean(), timeZone: z.optional(z.string()) }),
  z.strictObject({ type: z.literal("setWelcomeNudge"), on: z.boolean() }),
  z.strictObject({ type: z.literal("setPublicCelebrations"), on: z.boolean() }),
  z.strictObject({ type: z.literal("pickMondayPostChannel"), channel: z.string() }),
  z.strictObject({ type: z.literal("buyItem"), item: z.string() }),
  z.strictObject({ type: z.literal("setCustomKudosEmoji"), emoji: z.array(z.string()) }),
  z.strictObject({ type: z.literal("buyCrate"), next: zv.number() }),
  z.strictObject({ type: z.literal("openCrate"), crate: z.string() }),
  z.strictObject({ type: z.literal("setAvatar"), hoggie: z.union([z.string(), z.null()]) }),
  z.strictObject({ type: z.literal("linkMyCompanyProfile"), profile: z.union([zv.number(), z.null()]) }),
  z.strictObject({ type: z.literal("linkCompanyProfile"), member: z.union([zv.id("members"), z.null()]), profile: z.union([zv.number(), z.literal("none"), z.null()]) }),
  z.strictObject({ type: z.literal("setWorkspaceSettings"), baseAllowance: zv.number(), kudosEmoji: z.string(), hugBudget: zv.number() }),
  z.strictObject({ type: z.literal("stopMondayQuests"), dm: zv.id("mondayDms") }),
  z.strictObject({ type: z.literal("resumeMondayQuests"), dm: zv.id("mondayDms") }),]
);

export type Command = z.infer<typeof commandValidator>;

export type CommandOrigin = { surface: Surface; idempotencyKey: string; pressedIn?: PressedIn };

export type CommandOutcome = PurchaseOutcome | ItemPurchaseOutcome | CratePurchaseOutcome | SelfLinkOutcome | AdminLinkOutcome | WorkspaceSettingsOutcome | ChannelPickOutcome | null;

const websiteOnly: ReadonlySet<Command["type"]> = new Set(["linkMyCompanyProfile", "linkCompanyProfile", "setWorkspaceSettings", "pickMondayPostChannel"]);

export function isWebsiteOnly({ type }: Command): boolean {
  return websiteOnly.has(type);
}

export function commandOf(candidate: unknown): Command | null {
  throw notPorted("commands.commands.commandOf");
}

export async function commandsOfferedTo(ctx: QueryContext, member: MemberId, commands: Command[]): Promise<Command[]> {
  throw notPorted("commands.commands.commandsOfferedTo");
}

export async function runCommand(ctx: MutationContext, workspace: string, person: HomeMember, command: Command, { surface, idempotencyKey, pressedIn }: CommandOrigin): Promise<CommandOutcome> {
  throw notPorted("commands.commands.runCommand");
}
