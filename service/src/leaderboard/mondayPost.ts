// The weekly post, as today's convex/leaderboard/mondayPost.ts: an admin switches it on in a time zone, and every
// Monday at 9:00 there it posts last week's top kudos, or the group board, in the picked or announcement channel. A
// generation numbers each switch-on, so jobs booked before a switch-off or a zone change find nothing to do, and the
// week's claim row lets one run post it, however many run.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { exposed, memberDecision, workspaceDecision, type Flag } from "../analytics/flags.ts";
import type { Id } from "../db/columns.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import type { Doc } from "../db/schema/index.ts";
import { mondayPostClaims, mondayPostSettings } from "../db/schema/leaderboard.ts";
import { allowanceDay, wallClockAt, weekOf, type DayKey } from "../engine/allowance.ts";
import { albumSlackAppliesToWorkspace } from "../feedback/albumSlack.ts";
import { republishAdminsInJob } from "../feedback/homes.ts";
import { availableIn } from "../groups/groups.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";
import { xpLevelsShownIn } from "../progression/xpLevels.ts";
import { checkPickedChannelJob, postMondayPostJob } from "../slack/mondayPost.ts";
import { zv } from "../values.ts";
import type { MemberId } from "../workspace/directory.ts";
import { settingsOf } from "../workspace/settings.ts";
import { maintainerSettingsApplyTo } from "../workspace/workspaceSettings.ts";
import { workspaceGroupsBoardOf } from "./groupBoards.ts";
import { channelRefusalValidator, mondayPostOutcomeValidator, type ChannelCheck } from "./mondayPostOutcome.ts";
import { featureNewGivers, unfeatureNewGivers } from "./newGivers.ts";
import { wholeWeekBefore } from "./periods.ts";
import { isTimeZone } from "./timeZones.ts";
import { topKudosPostOf, type TopKudosPost } from "./topKudos.ts";
import { giversIn } from "./totals.ts";
import { unique } from "../db/unique.ts";

export const mondayPostFlag = { key: "monday-post", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const weeklyPostChannelFlag = { key: "weekly-post-channel", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type MondayPostChange = { on: boolean; timeZone?: string };

export type MondayPostSwitch = { channel: string; channelPicked: boolean; on: boolean; timeZone: string; cantPost: boolean; posts: WeeklyPost["kind"] };

export type ChannelPick = { picked: string | null; check: ChannelCheck | null; pick: number };

type PostChannel = { id: string; picked: boolean };

export type ChannelPickOutcome = { kind: "checking"; pick: number };

export type WeeklyPostSwitch = MondayPostSwitch & { channelPick?: ChannelPick };

export type PostedGroup = { rank: number; name: string; perMember: number };

export type MondayPost = { kind: "groups"; groups: PostedGroup[]; mostImproved: string | null; givers: number };

export type WeeklyPost = MondayPost | TopKudosPost;

export type ClaimedWeek = { claim: Id<"mondayPostClaims">; channel: string; post: WeeklyPost };

type Switcher = { member: MemberId; timeZone: string | undefined };

type Admin = Switcher & { admin: boolean };

type Settings = Doc<"mondayPostSettings">;

type Claim = Doc<"mondayPostClaims">;

const postedAtHour = 9;
const groupsPosted = 3;
const dayMs = 24 * 60 * 60 * 1000;

export async function mondayPostSwitchShownTo(ctx: MutationContext, workspace: string, person: Admin): Promise<MondayPostSwitch | null> {
  if (!(await setsMondayPost(ctx, person))) return null;
  return mondayPostSwitchIn(ctx, workspace, person);
}

export async function mondayPostSwitchReadBy(ctx: QueryContext, workspace: string, person: Switcher): Promise<WeeklyPostSwitch | null> {
  if (!(await memberDecision(ctx, mondayPostFlag, person.member))) return null;
  const shown = await mondayPostSwitchIn(ctx, workspace, person);
  if (shown === null || !(await workspaceDecision(ctx, weeklyPostChannelFlag, workspace))) return shown;
  return { ...shown, channelPick: channelPickOf(await settingsRow(ctx.tx, workspace)) };
}

async function mondayPostSwitchIn(ctx: QueryContext, workspace: string, person: Switcher): Promise<MondayPostSwitch | null> {
  const postChannel = await switchableChannelIn(ctx, workspace);
  if (postChannel === null) return null;
  const { id: channel, picked: channelPicked } = postChannel;
  const settings = await settingsRow(ctx.tx, workspace);
  const posts = (await albumSlackAppliesToWorkspace(ctx, workspace)) ? "topKudos" : "groups";
  return { channel, channelPicked, on: settings?.on ?? false, timeZone: zoneASwitchOnUses(settings, person), cantPost: await couldNotPostIn(ctx.tx, workspace, channel), posts };
}

export async function setMondayPost(ctx: MutationContext, workspace: string, person: Admin, change: MondayPostChange): Promise<boolean> {
  if (!(await setsMondayPost(ctx, person))) return false;
  const settings = await settingsRow(ctx.tx, workspace);
  if (!change.on) return switchOff(ctx, settings);
  if (change.timeZone !== undefined && !isTimeZone(change.timeZone)) return false;
  if ((await switchableChannelIn(ctx, workspace)) === null) return false;
  const timeZone = change.timeZone ?? zoneASwitchOnUses(settings, person);
  if (settings?.on && settings.timeZone === timeZone) return false;
  await scheduleNextPost(ctx, await switchOn(ctx, workspace, settings, timeZone));
  return true;
}

export async function pickMondayPostChannel(ctx: MutationContext, workspace: string, maintainer: Switcher, channel: string): Promise<ChannelPickOutcome | null> {
  if (!(await setsMondayPost(ctx, { ...maintainer, admin: false })) || !(await picksChannelIn(ctx, workspace, maintainer.member))) return null;
  if ((await switchableChannelIn(ctx, workspace)) === null) return null;
  const settings = await settingsRow(ctx.tx, workspace);
  const channelCheck = { channel, pick: (settings?.channelCheck?.pick ?? 0) + 1, outcome: "checking" as const };
  if (settings === null) await insertSettings(ctx, { workspace, on: false, timeZone: zoneOf(maintainer), generation: 0, channelCheck });
  else await writeSettings(ctx.tx, { ...settings, channelCheck });
  await ctx.jobs.enqueue(checkPickedChannelJob, { workspace, channel, pick: channelCheck.pick });
  return { kind: "checking", pick: channelCheck.pick };
}

export const foundChannelValidator = z.union([z.strictObject({ kind: z.literal("public"), name: z.string() }), z.strictObject({ kind: z.literal("refused"), reason: channelRefusalValidator })]);

export const recordChannelCheckArgs = z.strictObject({ workspace: z.string(), channel: z.string(), pick: zv.number(), found: foundChannelValidator });
/** Records what Slack said of a picked channel, if that pick is still the one being checked. */
export async function recordChannelCheck(ctx: MutationContext, { workspace, channel, pick, found }: z.infer<typeof recordChannelCheckArgs>): Promise<void> {
  const settings = await settingsRow(ctx.tx, workspace);
  if (settings === null || !isChecking(settings, channel, pick)) return;
  if (found.kind === "refused") {
    await writeSettings(ctx.tx, { ...settings, channelCheck: { channel, pick, outcome: found.reason } });
    return;
  }
  await writeSettings(ctx.tx, { ...settings, channel: { id: channel, name: found.name }, channelCheck: { channel, pick, outcome: "picked" } });
  await ctx.jobs.enqueue(republishAdminsInJob, { workspace });
}

function isChecking({ channelCheck }: Settings, channel: string, pick: number) {
  return channelCheck?.channel === channel && channelCheck.pick === pick && channelCheck.outcome === "checking";
}

function channelPickOf(settings: Settings | null): ChannelPick {
  return { picked: settings?.channel?.name ?? null, check: settings?.channelCheck?.outcome ?? null, pick: settings?.channelCheck?.pick ?? 0 };
}

async function picksChannelIn(ctx: MutationContext, workspace: string, member: MemberId) {
  const applies = await workspaceDecision(ctx, weeklyPostChannelFlag, workspace);
  await exposed(ctx, weeklyPostChannelFlag, member, applies);
  return applies;
}

async function switchOn(ctx: MutationContext, workspace: string, settings: Settings | null, timeZone: string): Promise<Settings> {
  const switchedOn = { workspace, on: true, timeZone, generation: (settings?.generation ?? 0) + 1 };
  if (settings === null) return insertSettings(ctx, switchedOn);
  const { nextPostAt: _booked, ...kept } = settings;
  const patched = { ...kept, ...switchedOn };
  await writeSettings(ctx.tx, patched);
  return patched;
}

const jobArgs = { workspace: z.string(), generation: zv.number() };

export const bookNextPostArgs = z.strictObject(jobArgs);
/** Books the post after this one, unless the switch changed since this generation or it is booked already. */
export async function bookNextPost(ctx: MutationContext, { workspace, generation }: z.infer<typeof bookNextPostArgs>): Promise<void> {
  const settings = await switchedOnAt(ctx.tx, workspace, generation);
  if (settings !== null) await scheduleNextPost(ctx, settings);
}

export const claimWeekArgs = z.strictObject(jobArgs);
/**
 * Claims this week's post once 9:00 Monday has come in the switch's zone: the week's one claim row, written in the
 * transaction that found none, so a concurrent claim conflicts, retries and finds it. Answers what to post, or null.
 */
export async function claimWeek(ctx: MutationContext, { workspace, generation }: z.infer<typeof claimWeekArgs>): Promise<null | ClaimedWeek> {
  const settings = await switchedOnAt(ctx.tx, workspace, generation);
  if (settings === null) return null;
  const thisMonday = weekOf(allowanceDay(ctx.now, settings.timeZone)).monday;
  if (ctx.now < postingTimeOf(thisMonday, settings.timeZone) || (await claimOf(ctx.tx, workspace, thisMonday)) !== null) return null;
  const channel = await postableChannelIn(ctx, workspace);
  if (channel === null) return null;
  const post = await weeklyPostOf(ctx, workspace, thisMonday, settings.timeZone);
  const claim = await insertClaim(ctx, { workspace, week: thisMonday, claimedAt: ctx.now, channel, outcome: hasNothingToSay(post) ? "nobody-gave" : "claimed" });
  if (hasNothingToSay(post)) return null;
  if (post.kind === "topKudos") await featureNewGivers(ctx, workspace, thisMonday, post.newGivers ?? []);
  return { claim, channel, post };
}

export const postAgainLaterArgs = z.strictObject({ ...jobArgs, claim: zv.id("mondayPostClaims"), at: zv.number(), attempt: zv.number() });
/** Gives the week's claim back and books the post's next try at `at`, while the claim is still unanswered. */
export async function postAgainLater(ctx: MutationContext, { claim, at, ...job }: z.infer<typeof postAgainLaterArgs>): Promise<void> {
  const row = await claimRow(ctx.tx, claim);
  if (row === null || row.outcome !== "claimed") return;
  await ctx.tx.delete(mondayPostClaims).where(eq(mondayPostClaims._id, claim));
  await ctx.jobs.enqueue(postMondayPostJob, job, { at });
}

export const recordOutcomeArgs = z.strictObject({ claim: zv.id("mondayPostClaims"), outcome: mondayPostOutcomeValidator });
/** Answers the week's claim with how the post went, once. */
export async function recordOutcome(ctx: MutationContext, { claim, outcome }: z.infer<typeof recordOutcomeArgs>): Promise<void> {
  const row = await claimRow(ctx.tx, claim);
  if (row === null || row.outcome !== "claimed") return;
  await ctx.tx.update(mondayPostClaims).set({ outcome }).where(eq(mondayPostClaims._id, claim));
  if (outcome === "cant-post") await unfeatureNewGivers(ctx, row.workspace, row.week);
  await ctx.jobs.enqueue(republishAdminsInJob, { workspace: row.workspace });
}

async function switchedOnAt(tx: Transaction, workspace: string, generation: number) {
  const settings = await settingsRow(tx, workspace);
  return settings?.on && settings.generation === generation ? settings : null;
}

function nextPostAfter(at: number, timeZone: string): number {
  const thisMonday = weekOf(allowanceDay(at, timeZone)).monday;
  const thisWeeks = postingTimeOf(thisMonday, timeZone);
  return thisWeeks > at ? thisWeeks : postingTimeOf(dayAfter(thisMonday, 7), timeZone);
}

function postingTimeOf(monday: DayKey, timeZone: string) {
  return wallClockAt(monday, postedAtHour, timeZone);
}

async function setsMondayPost(ctx: MutationContext, { member, admin }: Admin) {
  if (!admin && !(await maintainerSettingsApplyTo(ctx, member))) return false;
  const applies = await memberDecision(ctx, mondayPostFlag, member);
  await exposed(ctx, mondayPostFlag, member, applies);
  return applies;
}

async function switchOff(ctx: MutationContext, settings: Settings | null) {
  if (settings === null || !settings.on) return false;
  await writeSettings(ctx.tx, { ...settings, on: false, generation: settings.generation + 1 });
  return true;
}

async function scheduleNextPost(ctx: MutationContext, settings: Settings) {
  const { workspace, timeZone, generation } = settings;
  const nextPostAt = nextPostAfter(ctx.now, timeZone);
  if (settings.nextPostAt === nextPostAt) return;
  await writeSettings(ctx.tx, { ...settings, nextPostAt });
  await ctx.jobs.enqueue(postMondayPostJob, { workspace, generation }, { at: nextPostAt });
}

async function postableChannelIn(ctx: MutationContext, workspace: string) {
  if (!(await workspaceDecision(ctx, mondayPostFlag, workspace))) return null;
  return (await switchableChannelIn(ctx, workspace))?.id ?? null;
}

export async function weeklyPostChannelOf(ctx: QueryContext, workspace: string): Promise<string | null> {
  return (await switchableChannelIn(ctx, workspace))?.id ?? null;
}

async function switchableChannelIn(ctx: QueryContext, workspace: string): Promise<PostChannel | null> {
  if (!(await xpLevelsShownIn(ctx, workspace)) || !(await availableIn(ctx, workspace))) return null;
  const picked = await pickedChannelIn(ctx, workspace);
  if (picked !== null) return { id: picked, picked: true };
  const announcement = (await settingsOf(ctx, workspace)).announcementChannel;
  return announcement === null ? null : { id: announcement, picked: false };
}

async function pickedChannelIn(ctx: QueryContext, workspace: string) {
  if (!(await workspaceDecision(ctx, weeklyPostChannelFlag, workspace))) return null;
  return (await settingsRow(ctx.tx, workspace))?.channel?.id ?? null;
}

async function weeklyPostOf(ctx: QueryContext, workspace: string, thisMonday: DayKey, timeZone: string): Promise<WeeklyPost> {
  if (!(await albumSlackAppliesToWorkspace(ctx, workspace))) return lastWeeksPostOf(ctx, workspace, thisMonday);
  return topKudosPostOf(ctx, workspace, { from: wallClockAt(dayAfter(thisMonday, -7), 0, timeZone), to: wallClockAt(thisMonday, 0, timeZone) }, thisMonday);
}

function hasNothingToSay(post: WeeklyPost) {
  return post.kind === "groups" ? post.givers === 0 : post.kudos.length === 0 && post.teams.length === 0 && (post.newGivers ?? []).length === 0;
}

async function lastWeeksPostOf(ctx: QueryContext, workspace: string, thisMonday: DayKey): Promise<MondayPost> {
  const compared = wholeWeekBefore(thisMonday);
  const board = await workspaceGroupsBoardOf(ctx, workspace, compared);
  const groups = board.rows.filter(({ position, kudos }) => position <= groupsPosted && kudos > 0).map(({ rank, name, perMember }) => ({ rank, name, perMember }));
  return { kind: "groups", groups, mostImproved: board.mostImproved?.name ?? null, givers: await giversIn(ctx, workspace, compared.now) };
}

// The workspace's latest claim by the index's order (week, then creation), as Convex's `order("desc").first()`.
async function couldNotPostIn(tx: Transaction, workspace: string, channel: string) {
  const [latest] = await tx
    .select({ outcome: mondayPostClaims.outcome, channel: mondayPostClaims.channel })
    .from(mondayPostClaims)
    .where(eq(mondayPostClaims.workspace, workspace))
    .orderBy(desc(mondayPostClaims.week), desc(mondayPostClaims._creationTime), desc(mondayPostClaims._id))
    .limit(1);
  return latest?.outcome === "cant-post" && latest.channel === channel;
}

// One claim per workspace and week, as Convex's `unique()` asked: a second one is an error, not a choice.
async function claimOf(tx: Transaction, workspace: string, week: DayKey): Promise<Claim | null> {
  const row = unique("mondayPostClaims", await tx.select().from(mondayPostClaims).where(and(eq(mondayPostClaims.workspace, workspace), eq(mondayPostClaims.week, week))).limit(2));
  return row ? toDocument<Claim>(mondayPostClaims, row) : null;
}

async function claimRow(tx: Transaction, claim: Id<"mondayPostClaims">): Promise<Claim | null> {
  const [row] = await tx.select().from(mondayPostClaims).where(eq(mondayPostClaims._id, claim));
  return row ? toDocument<Claim>(mondayPostClaims, row) : null;
}

async function insertClaim(ctx: MutationContext, claim: Omit<Claim, "_id" | "_creationTime">): Promise<Id<"mondayPostClaims">> {
  const document = { ...ctx.newRow(), ...claim };
  await ctx.tx.insert(mondayPostClaims).values(fromDocument(mondayPostClaims, document) as typeof mondayPostClaims.$inferInsert);
  return document._id as Id<"mondayPostClaims">;
}

// One settings row per workspace, as Convex's `unique()` asked.
async function settingsRow(tx: Transaction, workspace: string): Promise<Settings | null> {
  const row = unique("mondayPostSettings", await tx.select().from(mondayPostSettings).where(eq(mondayPostSettings.workspace, workspace)).limit(2));
  return row ? toDocument<Settings>(mondayPostSettings, row) : null;
}

async function insertSettings(ctx: MutationContext, settings: Omit<Settings, "_id" | "_creationTime">): Promise<Settings> {
  const document = { ...ctx.newRow(), ...settings } as Settings;
  await ctx.tx.insert(mondayPostSettings).values(fromDocument(mondayPostSettings, document) as typeof mondayPostSettings.$inferInsert);
  return document;
}

// Writes the whole document back, so a field it leaves out is removed, as Convex's `patch` with `undefined` did.
async function writeSettings(tx: Transaction, settings: Settings): Promise<void> {
  await tx.update(mondayPostSettings).set(fromDocument(mondayPostSettings, settings)).where(eq(mondayPostSettings._id, settings._id));
}

function zoneASwitchOnUses(settings: Settings | null, person: Switcher) {
  return settings?.on ? settings.timeZone : zoneOf(person);
}

function zoneOf({ timeZone }: Switcher) {
  return timeZone ?? "UTC";
}

function dayAfter(day: DayKey, days: number): DayKey {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
}
