// The settings page's commands: today's settings mutations in convex/website/commands.ts. Each is a plain command
// handler `(ctx, me, person, args)` with its argument shape, which S17's route list registers under its former Convex
// path, `website.commands.<function>`. Every command runs through the shared command runner with the website surface and
// today's idempotency key, then answers with what was stored, so a refused or unchanged setting answers `refused`.
import { z } from "zod";
import { runCommand, type Command } from "../commands/commands.ts";
import { republish, type HomeMember } from "../feedback/homes.ts";
import { countingGroupsOf, groupsShownTo, primaryGroupOf } from "../groups/groups.ts";
import { messageSettingsOnFor } from "../messageSettings/flag.ts";
import { messageKindValidator, messagePlaceValidator, placesChosenFrom, type MessageKind, type MessagePlace } from "../messageSettings/kinds.ts";
import { kindAppliesTo, placeOf } from "../messageSettings/messageSettings.ts";
import { isOnTheBoards } from "../leaderboard/visibility.ts";
import { avatarOf } from "../album/hoggies/avatar.ts";
import { avatarShownTo } from "../album/hoggies/flag.ts";
import { userGroupsOf } from "../workspace/userGroups.ts";
import { maintainerSettingsApplyTo } from "../workspace/workspaceSettings.ts";
import { mondayPostSwitchReadBy } from "../leaderboard/mondayPost.ts";
import { celebrationsSwitchReadIn } from "../workspace/celebrationsSwitch.ts";
import { channelOfLink } from "../slack/permalink.ts";
import { userGroups } from "../db/schema/index.ts";
import { rowById } from "../workspace/rows.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { AvatarAnswer, GroupPickAnswer, MessageSettingAnswer, PublicCelebrationsAnswer, VisibilityAnswer, WeeklyPostAnswer, WeeklyPostChannelAnswer } from "./commands.ts";
import { noLaunchWaitsFor } from "./flag.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { leaderboardStateOf, unlockPathOf } from "./unlockPath.ts";

const refused = { kind: "refused" } as const;

function runFromWebsite(ctx: MutationContext, me: VerifiedMember, person: HomeMember, command: Command, idempotencyKey: string) {
  return runCommand(ctx, me.workspace, person, command, { surface: "website", idempotencyKey });
}

export const setBoardVisibilityArgs = { visible: z.boolean() };

export async function setBoardVisibility(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { visible }: { visible: boolean }): Promise<VisibilityAnswer> {
  if (!(await boardOpenWithEveryLaunchRecorded(queryOnly(ctx), me))) return refused;
  const before = await isOnTheBoards(ctx, me.member);
  await runFromWebsite(ctx, me, person, { type: "setLeaderboardVisibility", visible }, `website:setBoardVisibility:${me.member}`);
  const stored = await isOnTheBoards(ctx, me.member);
  if (stored !== before) await republish(ctx, me.member);
  return { kind: "set", visible: stored };
}

export const setAvatarArgs = { hoggie: z.union([z.string(), z.null()]) };

export async function setAvatar(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { hoggie }: { hoggie: string | null }): Promise<AvatarAnswer> {
  if (!(await noLaunchWaitsFor(ctx, me))) return refused;
  const before = await avatarOf(ctx, me.member);
  await runFromWebsite(ctx, me, person, { type: "setAvatar", hoggie }, `website:setAvatar:${me.member}`);
  if (!(await avatarShownTo(ctx, me.member))) return refused;
  const after = await avatarOf(ctx, me.member);
  if (after?.hoggie !== before?.hoggie) await republish(ctx, me.member);
  return (after?.hoggie ?? null) === hoggie ? { kind: "set", avatar: after } : refused;
}

export const setMessageSettingArgs = { kind: messageKindValidator, place: messagePlaceValidator };

export async function setMessageSetting(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { kind, place }: { kind: MessageKind; place: MessagePlace }): Promise<MessageSettingAnswer> {
  if (!(await placeOfferedWithEveryLaunchRecorded(queryOnly(ctx), me, kind, place))) return refused;
  const before = await placeOf(ctx, me.member, kind);
  await runFromWebsite(ctx, me, person, { type: "setMessageSetting", kind, place }, `website:setMessageSetting:${me.member}:${kind}`);
  const stored = await placeOf(ctx, me.member, kind);
  if (stored !== before) await republish(ctx, me.member);
  return stored === place ? { kind: "set", place } : refused;
}

export const setWeeklyPostArgs = { on: z.boolean() };

export async function setWeeklyPost(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { on }: { on: boolean }): Promise<WeeklyPostAnswer> {
  if (!(await maintainerSettingsApplyTo(ctx, me.member)) || (await mondayPostSwitchReadBy(ctx, me.workspace, person)) === null) return refused;
  await runFromWebsite(ctx, me, person, { type: "setMondayPost", on }, `website:setWeeklyPost:${me.member}`);
  return (await mondayPostSwitchReadBy(ctx, me.workspace, person))?.on === on ? { kind: "set" } : refused;
}

export const setPublicCelebrationsArgs = { on: z.boolean() };

export async function setPublicCelebrations(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { on }: { on: boolean }): Promise<PublicCelebrationsAnswer> {
  if (!(await noLaunchWaitsFor(queryOnly(ctx), me)) || !(await maintainerSettingsApplyTo(ctx, me.member)) || (await celebrationsSwitchReadIn(ctx, me.workspace)) === null) return refused;
  await runFromWebsite(ctx, me, person, { type: "setPublicCelebrations", on }, `website:setPublicCelebrations:${me.member}`);
  return (await celebrationsSwitchReadIn(ctx, me.workspace)) === on ? { kind: "set" } : refused;
}

export const pickWeeklyPostChannelArgs = { link: z.string() };

export async function pickWeeklyPostChannel(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { link }: { link: string }): Promise<WeeklyPostChannelAnswer> {
  const channel = channelOfLink(link);
  if (channel === null) return { kind: "refused", reason: "not-a-channel-link" };
  const outcome = await runFromWebsite(ctx, me, person, { type: "pickMondayPostChannel", channel }, `website:pickWeeklyPostChannel:${me.member}`);
  return outcome?.kind === "checking" ? { kind: "checking", pick: outcome.pick } : { kind: "refused", reason: null };
}

export const pickPrimaryGroupArgs = { group: z.string() };

export async function pickPrimaryGroup(ctx: MutationContext, me: VerifiedMember, person: HomeMember, { group }: { group: string }): Promise<GroupPickAnswer> {
  if (!(await groupOfferedWithEveryLaunchRecorded(queryOnly(ctx), me, group))) return refused;
  const before = await primaryGroupOf(ctx, me.member);
  await runFromWebsite(ctx, me, person, { type: "pickPrimaryGroup", group, surface: "website" }, `website:pickPrimaryGroup:${me.member}`);
  const picked = await primaryGroupOf(ctx, me.member);
  if (picked?.group !== before?.group) await republish(ctx, me.member);
  return picked?.group === group ? { kind: "picked", group } : refused;
}

// The guards read as today's did, through a read-only context: a flag read there writes no analytics ID or workspace
// key, so a refused command writes nothing at all.
function queryOnly({ tx, now }: MutationContext): QueryContext {
  return { tx, now };
}

async function boardOpenWithEveryLaunchRecorded(ctx: QueryContext, me: VerifiedMember) {
  return (await leaderboardStateOf(ctx, me, await unlockPathOf(ctx, me))).kind === "open" && (await noLaunchWaitsFor(ctx, me));
}

async function placeOfferedWithEveryLaunchRecorded(ctx: QueryContext, me: VerifiedMember, kind: MessageKind, place: MessagePlace) {
  if (!(await messageSettingsOnFor(ctx, me.member)) || !(await kindAppliesTo(ctx, me.member, kind))) return false;
  return placesChosenFrom[kind].includes(place) && (await noLaunchWaitsFor(ctx, me));
}

async function groupOfferedWithEveryLaunchRecorded(ctx: QueryContext, me: VerifiedMember, group: string) {
  if (!(await groupsShownTo(ctx, me.member))) return false;
  return (await isStillAmong(ctx, me, group)) && (await noLaunchWaitsFor(ctx, me));
}

// The group the member picks is still one they count in, and the Slack user group behind it still has them.
async function isStillAmong(ctx: QueryContext, me: VerifiedMember, group: string) {
  const offered = (await countingGroupsOf(ctx, me.member)).find((each) => each.group === group);
  const row = offered === undefined ? null : await rowById<{ group: string }>(ctx, userGroups, offered.group);
  return row !== null && (await userGroupsOf(ctx, me.workspace, me.user)).some((membership) => membership.group === row.group);
}
