// The module map's skeleton of convex/website/commands.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { AdminLinkRefusal } from "../companyProfiles/admin.ts";
import type { SelfLinkRefusal } from "../companyProfiles/links.ts";
import type { MessagePlace } from "../messageSettings/kinds.ts";
import type { Avatar } from "../album/hoggies/avatar.ts";
import type { Drop } from "../album/hoggies/drops.ts";
import type { AppliedReward } from "../progression/rewards.ts";
import type { CrateRefusal } from "../album/hoggies/records.ts";
import type { ItemRefusal } from "../store/rows.ts";
import type { WorkspaceSettingsRefusal } from "../workspace/workspaceSettings.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type CommandAnswer = { kind: "opened"; applied?: AppliedReward | null; drop?: Drop | null } | { kind: "refused" };

export type PurchaseRefusal = "owned" | "level" | "requires" | "points" | "coins" | "coins-not-open" | "not-open";

export type PurchaseAnswer = { kind: "bought" } | { kind: "refused"; reason: PurchaseRefusal | null };

export type ItemPurchaseRefusal = ItemRefusal["reason"];

export type ItemPurchaseAnswer = { kind: "bought"; item: string } | { kind: "refused"; reason: ItemPurchaseRefusal | null };

export type CratePurchaseAnswer = { kind: "bought"; crate: string } | { kind: "refused"; reason: CrateRefusal["reason"] } | null;

export type CrateOpenAnswer = { kind: "opened"; applied?: AppliedReward | null; drop: Drop | null } | { kind: "refused" };

export type VisibilityAnswer = { kind: "set"; visible: boolean } | { kind: "refused" };

export type MessageSettingAnswer = { kind: "set"; place: MessagePlace } | { kind: "refused" };

export type GroupPickAnswer = { kind: "picked"; group: string } | { kind: "refused" };

export type CompanyProfileLinkAnswer = { kind: "linked" } | { kind: "refused"; reason: SelfLinkRefusal | null };

export type AdminProfileLinkAnswer = { kind: "linked" } | { kind: "refused"; reason: AdminLinkRefusal | null };

export type WorkspaceSettingsAnswer = { kind: "set" } | { kind: "refused"; reason: WorkspaceSettingsRefusal | null };

export type WeeklyPostAnswer = { kind: "set" } | { kind: "refused" };

export type PublicCelebrationsAnswer = { kind: "set" } | { kind: "refused" };

export type WeeklyPostChannelAnswer = { kind: "checking"; pick: number } | { kind: "refused"; reason: "not-a-channel-link" | null };

export type AvatarAnswer = { kind: "set"; avatar: Avatar | null } | { kind: "refused" };

export async function appliedShownTo(ctx: QueryContext, me: VerifiedMember, applied: AppliedReward | null | undefined): Promise<AppliedReward | null> {
  throw notPorted("website.commands.appliedShownTo");
}
