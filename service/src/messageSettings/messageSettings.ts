// The module map's skeleton of convex/messageSettings/messageSettings.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { MessageKind, MessageKindEntry, MessagePlace } from "./kinds.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type MessageSetting = MessageKindEntry & { applies: boolean; on: boolean; place: MessagePlace; places: readonly MessagePlace[] };

export type NotificationSwitches = { muteNotices: boolean; dms: boolean };

export type ShownNotificationSwitches = Partial<Pick<NotificationSwitches, "muteNotices">> & Pick<NotificationSwitches, "dms">;

export async function messageSettingsOf(ctx: QueryContext, member: MemberId): Promise<MessageSetting[]> {
  throw notPorted("messageSettings.messageSettings.messageSettingsOf");
}

export async function kindAppliesTo(ctx: QueryContext, member: MemberId, kind: MessageKind): Promise<boolean> {
  throw notPorted("messageSettings.messageSettings.kindAppliesTo");
}

export async function wantsMessage(ctx: QueryContext, member: MemberId, kind: MessageKind): Promise<boolean> {
  throw notPorted("messageSettings.messageSettings.wantsMessage");
}

export async function placeOf(ctx: QueryContext, member: MemberId, kind: MessageKind): Promise<MessagePlace> {
  throw notPorted("messageSettings.messageSettings.placeOf");
}

export async function setMessageSetting(ctx: MutationContext, member: MemberId, kind: MessageKind, place: MessagePlace): Promise<boolean> {
  throw notPorted("messageSettings.messageSettings.setMessageSetting");
}

export async function placeWhenOn(ctx: QueryContext, member: MemberId, kind: MessageKind): Promise<MessagePlace> {
  throw notPorted("messageSettings.messageSettings.placeWhenOn");
}

export async function notificationSwitchesOf(ctx: QueryContext, member: MemberId): Promise<ShownNotificationSwitches> {
  throw notPorted("messageSettings.messageSettings.notificationSwitchesOf");
}

export async function setNotificationSwitches(ctx: MutationContext, member: MemberId, { muteNotices, dms }: Partial<NotificationSwitches>): Promise<void> {
  throw notPorted("messageSettings.messageSettings.setNotificationSwitches");
}
