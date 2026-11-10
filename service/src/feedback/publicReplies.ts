// The one public reply, as today's convex/feedback/publicReplies.ts: what it may show and the states of its one post
// (posting, sending, posted, unposted), which slack/publicReplies.ts moves as it delivers. Celebrating a level and
// announcing still throw notPorted until S5's public celebrations port them.
import { eq } from "drizzle-orm";
import { achievementsApplyIn } from "../achievements/flag.ts";
import { levelReachedEventValidator } from "../bus/events.ts";
import { decodeStored, encodeStored } from "../db/codec.ts";
import { toDocument } from "../db/documents.ts";
import { publicReplies } from "../db/schema/feedback.ts";
import { messageRefValidator, type MessageRef } from "../engine/messageEvent.ts";
import { wantsMessage } from "../messageSettings/messageSettings.ts";
import { xpLevelsShownIn } from "../progression/xpLevels.ts";
import { publicCelebrationsOn } from "../workspace/celebrationsSwitch.ts";
import { type MemberId } from "../workspace/directory.ts";
import { settingsOf } from "../workspace/settings.ts";
import { segmentValidator, type Line } from "./segments.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const publicSectionValidator = z.strictObject({ key: z.string(), member: zv.id("members"), about: z.union([z.literal("level"), z.literal("achievement")]), line: z.array(segmentValidator) });

export const shownValidator = z.union([
  z.strictObject({ state: z.literal("unposted") }),
  z.strictObject({ state: z.literal("posting") }),
  z.strictObject({ state: z.literal("sending") }),
  z.strictObject({ state: z.literal("posted"), ts: z.string() }),]
);

const replyFields = { workspace: z.string(), channel: z.string(), sections: z.array(publicSectionValidator), version: zv.number(), shown: shownValidator };

export const publicReplyValidator = z.union([
  z.strictObject({ ...replyFields, conversation: z.string(), message: z.string(), threadTs: z.optional(z.string()) }),
  z.strictObject({ ...replyFields, reached: z.strictObject({ member: zv.id("members"), level: zv.number() }) }),
  z.strictObject({ ...replyFields, summary: zv.id("tierSummaries") }),]
);

export const celebratedLevelValidator = z.strictObject({ ...messageRefValidator.shape, member: zv.id("members"), level: zv.number() });

export type PublicSection = z.infer<typeof publicSectionValidator>;
type Shown = z.infer<typeof shownValidator>;

type Announced = { reached: { member: MemberId; level: number } } | { summary: Id<"tierSummaries"> };

export const celebrateLevelArgs = z.strictObject({ event: levelReachedEventValidator });
export async function celebrateLevel(ctx: MutationContext, args: z.infer<typeof celebrateLevelArgs>): Promise<void> {
  throw notPorted("feedback.publicReplies.celebrateLevel");
}
export const celebrateLevelJob = mutationJob("feedback.publicReplies.celebrateLevel", celebrateLevelArgs, celebrateLevel);

export async function setPublicSection(ctx: MutationContext, ref: MessageRef, section: PublicSection): Promise<void> {
  throw notPorted("feedback.publicReplies.setPublicSection");
}

export async function announce(ctx: MutationContext, workspace: string, announced: Announced, section: PublicSection): Promise<void> {
  throw notPorted("feedback.publicReplies.announce");
}

export const desiredArgs = z.strictObject({ reply: zv.id("publicReplies") });
/** The reply with only the sections it may show now: none where public celebrations or levels are off, or where it would sit in a work thread. */
export async function desired(ctx: QueryContext, { reply }: z.infer<typeof desiredArgs>): Promise<Doc<"publicReplies"> | null> {
  const row = await publicReplyOf(ctx.tx, reply);
  if (row === null) return null;
  if (!(await isShownAtAll(ctx, row))) return { ...row, sections: [] };
  const bookApplies = await achievementsApplyIn(ctx, row.workspace);
  const shown = await Promise.all(row.sections.map((section) => (section.about !== "achievement" || bookApplies) && isShownPublicly(ctx, section)));
  return { ...row, sections: row.sections.filter((_, index) => shown[index]) };
}

export const recordPostedArgs = z.strictObject({ reply: zv.id("publicReplies"), ts: z.string() });
/** Records the posted message's ts, and answers the reply's version now, so a change made while it posted is delivered next. */
export async function recordPosted({ tx }: MutationContext, { reply, ts }: z.infer<typeof recordPostedArgs>): Promise<number> {
  const row = await shownOf(tx, reply);
  if (row === null) return 0;
  await setShown(tx, reply, { state: "posted", ts });
  return row.version;
}

export const startSendingArgs = z.strictObject({ reply: zv.id("publicReplies") });
/** Claims the one post of a reply waiting to be posted; false when another delivery claimed it, or nothing waits. */
export async function startSending({ tx }: MutationContext, { reply }: z.infer<typeof startSendingArgs>): Promise<boolean> {
  const row = await shownOf(tx, reply);
  if (row?.shown.state !== "posting") return false;
  await setShown(tx, reply, { state: "sending" });
  return true;
}

export const sendingFailedArgs = z.strictObject({ reply: zv.id("publicReplies") });
/** A post Slack refused waits to be posted again. */
export async function sendingFailed({ tx }: MutationContext, { reply }: z.infer<typeof sendingFailedArgs>): Promise<void> {
  if ((await shownOf(tx, reply))?.shown.state === "sending") await setShown(tx, reply, { state: "posting" });
}

export const stopPostingArgs = z.strictObject({ reply: zv.id("publicReplies") });
/** A reply still waiting to be posted is never posted; a later section posts it afresh. */
export async function stopPosting({ tx }: MutationContext, { reply }: z.infer<typeof stopPostingArgs>): Promise<void> {
  if ((await shownOf(tx, reply))?.shown.state === "posting") await setShown(tx, reply, { state: "unposted" });
}

export const stopSendingArgs = z.strictObject({ reply: zv.id("publicReplies") });
/** A post whose conversation is gone is never posted; a later section posts it afresh. */
export async function stopSending({ tx }: MutationContext, { reply }: z.infer<typeof stopSendingArgs>): Promise<void> {
  if ((await shownOf(tx, reply))?.shown.state === "sending") await setShown(tx, reply, { state: "unposted" });
}

export function linesOf(reply: Pick<Doc<"publicReplies">, "sections">): Line[] {
  return reply.sections.map(({ line }) => line);
}

async function isShownAtAll(ctx: QueryContext, row: Doc<"publicReplies">) {
  return (await xpLevelsShownIn(ctx, row.workspace)) && (await publicCelebrationsOn(ctx, row.workspace)) && !("reached" in row) && (await isCelebratedWhereItIs(ctx, row));
}

async function isCelebratedWhereItIs(ctx: QueryContext, row: Doc<"publicReplies">) {
  const { announcementChannel } = await settingsOf(ctx, row.workspace);
  if (announcementChannel === null) return false;
  if (!("conversation" in row)) return true;
  if (row.threadTs !== undefined) return false;
  return row.channel !== row.conversation || row.conversation === announcementChannel;
}

function isShownPublicly(ctx: QueryContext, { member }: PublicSection) {
  return wantsMessage(ctx, member, "celebrations");
}

async function publicReplyOf(tx: Transaction, reply: Id<"publicReplies">): Promise<Doc<"publicReplies"> | null> {
  const [row] = await tx.select().from(publicReplies).where(eq(publicReplies._id, reply));
  return row === undefined ? null : toDocument<Doc<"publicReplies">>(publicReplies, row);
}

async function shownOf(tx: Transaction, reply: Id<"publicReplies">): Promise<{ shown: Shown; version: number } | null> {
  const [row] = await tx.select({ shown: publicReplies.shown, version: publicReplies.version }).from(publicReplies).where(eq(publicReplies._id, reply));
  return row === undefined ? null : { shown: decodeStored(row.shown) as Shown, version: row.version };
}

async function setShown(tx: Transaction, reply: Id<"publicReplies">, shown: Shown) {
  await tx.update(publicReplies).set({ shown: encodeStored(shown) }).where(eq(publicReplies._id, reply));
}
