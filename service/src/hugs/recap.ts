// The hugs section of the Monday DM: last week's hugs given and received, their XP, and the message hugged most.
// Today's convex/hugs/recap.ts, on the operation's instant where it read `Date.now()`.
import { and, eq } from "drizzle-orm";
import { reportHugsRecapSent } from "../analytics/isolatedUsage.ts";
import { wallClockAt, type DayKey } from "../engine/allowance.ts";
import { threadRootOf } from "../engine/engine.ts";
import { emojiLineOf, type RecapEmojiLine } from "../feedback/albumRecap.ts";
import { teaserOf } from "../feedback/teaser.ts";
import { placeOf } from "../messageSettings/messageSettings.ts";
import { hugXpOf, type HugWeekXp } from "../progression/hugXp.ts";
import { xpLevelsOnFor } from "../progression/xpLevels.ts";
import { permalinkOf } from "../slack/permalink.ts";
import { isMember, timeZoneOf, type MemberId } from "../workspace/directory.ts";
import { settingsOf } from "../workspace/settings.ts";
import { workspaceUrlOf } from "../workspace/url.ts";
import { hugsOnAndExposedFor } from "./flag.ts";
import type { HugWeek, MostHugged } from "./weeks.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { hugWeeks } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export type RecapLine = string | { text: string; link: { url: string; label: string } };

export type HugsSection = { lines: RecapLine[]; closing: RecapLine[]; emojiLine: RecapEmojiLine | null };

const dayMs = 24 * 60 * 60 * 1000;
const weekByMemberWeek = indexOrder(hugWeeks, ["member", "week"]);

export async function hugsSectionFor(ctx: MutationContext, member: MemberId, monday: DayKey): Promise<HugsSection | null> {
  const week = await hugWeekOf(ctx, member, mondayBefore(monday));
  return week !== null && (await recapWantedBy(ctx, member)) ? hugsSectionOf(ctx, week) : null;
}

export async function hugsSentInTheMondayDm(ctx: MutationContext, member: MemberId, monday: DayKey): Promise<void> {
  const week = await hugWeekOf(ctx, member, mondayBefore(monday));
  if (week !== null) await reportHugsRecapSent(ctx, await recapSentOf(ctx, week));
}

async function recapSentOf(ctx: QueryContext, { workspace, member, week }: HugWeek) {
  const { given, received, givenXp, receivedXp } = await hugXpOf(ctx, member, week);
  return { workspace, member, given, received, xp: givenXp + receivedXp, via: "monday" as const, at: ctx.now };
}

async function hugWeekOf(ctx: QueryContext, member: MemberId, week: DayKey): Promise<HugWeek | null> {
  const rows = await ctx.tx
    .select()
    .from(hugWeeks)
    .where(and(eq(hugWeeks.member, member), eq(hugWeeks.week, week)))
    .orderBy(...weekByMemberWeek.orderBy())
    .limit(2);
  const row = unique("hugWeeks", rows);
  return row === null ? null : toDocument<HugWeek>(hugWeeks, row);
}

async function hugsSectionOf(ctx: QueryContext, week: HugWeek): Promise<HugsSection> {
  return { ...(await recapLinesOf(ctx, week)), emojiLine: await emojiLineOf(ctx, week, await weekInstantsOf(ctx, week)) };
}

async function weekInstantsOf(ctx: QueryContext, week: HugWeek) {
  const timeZone = (await timeZoneOf(ctx, week.member)) ?? undefined;
  return { from: wallClockAt(week.week, 0, timeZone), to: wallClockAt(mondayAfter(week.week), 0, timeZone) };
}

async function recapWantedBy(ctx: MutationContext, member: MemberId) {
  if (!(await isMember(ctx, member)) || !(await xpLevelsOnFor(ctx, member))) return false;
  return (await placeOf(ctx, member, "hugs-recap")) === "dm" && (await hugsOnAndExposedFor(ctx, member));
}

async function recapLinesOf(ctx: QueryContext, week: HugWeek): Promise<Omit<HugsSection, "emojiLine">> {
  const { kudosEmoji } = await settingsOf(ctx, week.workspace);
  const reacted = `reacted :${kudosEmoji}:`;
  const url = await workspaceUrlOf(ctx, week.workspace);
  const mostHugged = week.mostHugged === undefined || url === null ? [] : [await mostHuggedLineOf(ctx, url, reacted, week.workspace, week.mostHugged)];
  const teaser = await teaserOf(ctx, week.member);
  return {
    lines: [`:${kudosEmoji}: Your week in hugs`, ...countLinesOf(await hugXpOf(ctx, week.member, week.week), reacted), ...mostHugged],
    closing: [...(teaser === null ? [] : [teaser]), kudosNudgeWith(kudosEmoji)],
  };
}

function kudosNudgeWith(kudosEmoji: string) {
  return `Hugs are a quick thanks. A kudos, a message that mentions a teammate with :${kudosEmoji}:, earns much more XP.`;
}

function countLinesOf({ given, givenXp, received, receivedXp }: HugWeekXp, reacted: string): string[] {
  const givenLine = given === 0 ? [] : [`You ${reacted} and gave ${hugsOf(given)} (+${givenXp} XP).`];
  const receivedLine = received === 0 ? [] : [`Teammates ${reacted} on your messages and gave you ${hugsOf(received)} (+${receivedXp} XP).`];
  return [...givenLine, ...receivedLine];
}

async function mostHuggedLineOf(ctx: QueryContext, url: string, reacted: string, workspace: string, { conversation, message, hugs }: MostHugged): Promise<RecapLine> {
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
