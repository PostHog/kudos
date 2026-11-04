import type { MutationCtx, QueryCtx } from "../_generated/server";
import { reportHugsRecapSent } from "../analytics/isolatedUsage";
import { wallClockAt, type DayKey } from "../engine/allowance";
import { threadRootOf } from "../engine/engine";
import { emojiLineOf, type RecapEmojiLine } from "../feedback/albumRecap";
import { teaserOf } from "../feedback/teaser";
import { placeOf } from "../messageSettings/messageSettings";
import { hugXpOf, type HugWeekXp } from "../progression/hugXp";
import { xpLevelsOnFor } from "../progression/xpLevels";
import { permalinkOf } from "../slack/permalink";
import { chatUserOf, isMember, timeZoneOf, type MemberId } from "../workspace/directory";
import { settingsOf } from "../workspace/settings";
import { workspaceUrlOf } from "../workspace/url";
import { hugsOnAndExposedFor } from "./flag";
import type { MostHugged, HugWeek } from "./weeks";

export type RecapLine = string | { text: string; link: { url: string; label: string } };

export type HugsSection = { lines: RecapLine[]; closing: RecapLine[]; emojiLine: RecapEmojiLine | null };

const dayMs = 24 * 60 * 60 * 1000;

export async function hugsSectionFor(ctx: MutationCtx, member: MemberId, monday: DayKey): Promise<HugsSection | null> {
  const week = await hugWeekOf(ctx, member, mondayBefore(monday));
  return week !== null && (await recapWantedBy(ctx, member)) ? hugsSectionOf(ctx, week) : null;
}

export async function hugsSentInTheMondayDm(ctx: MutationCtx, member: MemberId, monday: DayKey) {
  const week = await hugWeekOf(ctx, member, mondayBefore(monday));
  if (week !== null) await reportHugsRecapSent(ctx, await recapSentOf(ctx, week));
}

async function recapSentOf(ctx: QueryCtx, { workspace, member, week }: HugWeek) {
  const { given, received, givenXp, receivedXp } = await hugXpOf(ctx, member, week);
  return { workspace, member, given, received, xp: givenXp + receivedXp, via: "monday" as const, at: Date.now() };
}

function hugWeekOf(ctx: QueryCtx, member: MemberId, week: DayKey) {
  return ctx.db
    .query("hugWeeks")
    .withIndex("by_member_week", (q) => q.eq("member", member).eq("week", week))
    .unique();
}

async function hugsSectionOf(ctx: QueryCtx, week: HugWeek): Promise<HugsSection> {
  return { ...(await recapLinesOf(ctx, week)), emojiLine: await emojiLineOf(ctx, week, await weekInstantsOf(ctx, week)) };
}

async function weekInstantsOf(ctx: QueryCtx, week: HugWeek) {
  const timeZone = (await timeZoneOf(ctx, week.member)) ?? undefined;
  return { from: wallClockAt(week.week, 0, timeZone), to: wallClockAt(mondayAfter(week.week), 0, timeZone) };
}

async function recapWantedBy(ctx: MutationCtx, member: MemberId) {
  if (!(await isMember(ctx, member)) || !(await xpLevelsOnFor(ctx, member))) return false;
  return (await placeOf(ctx, member, "hugs-recap")) === "dm" && (await hugsOnAndExposedFor(ctx, member));
}

async function recapLinesOf(ctx: QueryCtx, week: HugWeek): Promise<Omit<HugsSection, "emojiLine">> {
  const { kudosEmoji } = await settingsOf(ctx, week.workspace);
  const reacted = `reacted :${kudosEmoji}:`;
  const url = await workspaceUrlOf(ctx, week.workspace);
  const mostHugged = week.mostHugged === undefined || url === null ? [] : [await mostHuggedLineOf(ctx, url, reacted, week.workspace, week.mostHugged)];
  const teaser = await teaserOf(ctx, week.member);
  return { lines: [`:${kudosEmoji}: Your week in hugs`, ...countLinesOf(await hugXpOf(ctx, week.member, week.week), reacted), ...mostHugged], closing: [...(teaser === null ? [] : [teaser]), kudosNudgeWith(kudosEmoji)] };
}

function kudosNudgeWith(kudosEmoji: string) {
  return `Hugs are a quick thanks. A kudos, a message that mentions a teammate with :${kudosEmoji}:, earns much more XP.`;
}

function countLinesOf({ given, givenXp, received, receivedXp }: HugWeekXp, reacted: string): string[] {
  const givenLine = given === 0 ? [] : [`You ${reacted} and gave ${hugsOf(given)} (+${givenXp} XP).`];
  const receivedLine = received === 0 ? [] : [`Teammates ${reacted} on your messages and gave you ${hugsOf(received)} (+${receivedXp} XP).`];
  return [...givenLine, ...receivedLine];
}

async function mostHuggedLineOf(ctx: QueryCtx, url: string, reacted: string, workspace: string, { conversation, message, hugs }: MostHugged): Promise<RecapLine> {
  const ref = { workspace, conversation, message };
  return { text: `${teammatesOf(hugs)} ${reacted} on your most-hugged message: `, link: { url: permalinkOf(url, ref, await threadRootOf(ctx, ref)), label: "open it in Slack" } };
}

function teammatesOf(count: number) {
  return count === 1 ? "1 teammate" : `${count} teammates`;
}

function hugsOf(count: number) {
  return count === 1 ? "1 hug" : `${count} hugs`;
}

export function mondayAfter(week: DayKey): DayKey {
  return mondayShiftedBy(week, 7);
}

function mondayBefore(monday: DayKey): DayKey {
  return mondayShiftedBy(monday, -7);
}

function mondayShiftedBy(monday: DayKey, days: number): DayKey {
  return new Date(Date.parse(`${monday}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
}
