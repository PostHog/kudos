// The Monday DM's Slack side, as today's convex/slack/mondayDm.ts: each try takes what the DM's start kept, posts it,
// and reports back; Slack's rate limit books another try, at most three. A press of the DM's buttons redraws it.
import { z } from "zod";
import type { Id } from "../db/columns.ts";
import type { RecapEmojiLine } from "../feedback/albumRecap.ts";
import type { HugsSection, RecapLine } from "../hugs/recap.ts";
import { actionJob } from "../jobs/define.ts";
import { mondayDmEnded, mondayDmLater, startMondayDm, type MondayDm, type MondayQuests } from "../mondayDm/mondayDm.ts";
import type { MondayDmContent } from "../mondayDm/records.ts";
import { shownMondayDm } from "../mondayDm/stop.ts";
import type { ActionContext } from "../operations.ts";
import { zv } from "../values.ts";
import { settingsFooterText } from "./appHomeLinks.ts";
import { buttonOf, escaped, mrkdwn, urlButtonOf } from "./blocks.ts";
import { checklistBlockOf } from "./checklist.ts";
import { attemptArgs, attemptCall, enqueueAt, isRateLimited, isRefusedForItsBlocks, retryAfter, sendOnce, slackLink, tryAtMostThreeTimes, type Attempt } from "./delivery.ts";

const triesAtMost = 3;
const mostPicturesInALine = 9;

export const sendMondayDmArgs = z.strictObject({ dm: zv.id("mondayDms"), attempt: zv.number() });
export async function sendMondayDm(ctx: ActionContext, { dm, attempt }: z.infer<typeof sendMondayDmArgs>): Promise<void> {
  const message = await ctx.run.mutation("mondayDm.mondayDm.startMondayDm", (m) => startMondayDm(m, { dm, attempt }));
  if (message === null) return;
  const sent = await postMondayDm(ctx, message);
  // A held call never reached Slack, so it keeps its attempt and waits out the hold, as `tryAtMostThreeTimes` does.
  if (isRateLimited(sent) && (sent.kind === "held" || attempt < triesAtMost)) {
    const retry = retryAfter(sent, attempt, ctx.clock.now())!;
    await ctx.run.mutation("mondayDm.mondayDm.mondayDmLater", (m) => mondayDmLater(m, { dm, attempt, retry }));
    return;
  }
  await ctx.run.mutation("mondayDm.mondayDm.mondayDmEnded", (m) => mondayDmEnded(m, { dm, attempt, outcome: outcomeOf(sent) }));
}
export const sendMondayDmJob = actionJob("slack.mondayDm.sendMondayDm", sendMondayDmArgs, sendMondayDm);

export const showMondayDmArgs = z.strictObject({ dm: zv.id("mondayDms"), channel: z.string(), ts: z.string(), ...attemptArgs });
export async function showMondayDm(ctx: ActionContext, { dm, channel, ts, attempt = 1 }: z.infer<typeof showMondayDmArgs>): Promise<void> {
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    async (attempt) => {
      const shown = await ctx.run.query("mondayDm.stop.shownMondayDm", (q) => shownMondayDm(q, { dm }));
      if (shown?.content.quests == null) return null;
      const message = shown.stopped ? stoppedMessageOf(dm, shown.workspace, shown.content) : messageOf({ dm, workspace: shown.workspace, nudge: shown.nudge, ...shown.content }, shown.content.quests);
      return sendOnce(ctx, shown.workspace, "chat.update", { channel, ts, ...message }, attempt);
    },
    (retry) => enqueueAt(ctx, showMondayDmJob, { dm, channel, ts, attempt: retry.attempt }, retry.at),
  );
}
export const showMondayDmJob = actionJob("slack.mondayDm.showMondayDm", showMondayDmArgs, showMondayDm);

function postMondayDm(ctx: ActionContext, dm: MondayDm): Promise<Attempt> {
  const { workspace, user, hugs, quests } = dm;
  if (quests === null) return postHugsAlone(ctx, dm, hugs!);
  return attemptCall(ctx, workspace, "chat.postMessage", { channel: user, ...messageOf(dm, quests) });
}

async function postHugsAlone(ctx: ActionContext, { workspace, user, footer }: MondayDm, { lines, closing, emojiLine }: HugsSection): Promise<Attempt> {
  const footers = footerOf(workspace, footer);
  const allLines = [...lines, ...closing].map(lineTextOf);
  const words = { channel: user, text: [...allLines, ...(emojiLine === null ? [] : [emojiLine.text]), ...footers].join("\n") };
  if (emojiLine === null) return attemptCall(ctx, workspace, "chat.postMessage", words);
  const blocks = [{ type: "section", text: mrkdwn(allLines.join("\n")) }, emojiLineBlockOf(emojiLine), ...footers.map((text) => ({ type: "context", elements: [mrkdwn(text)] }))];
  const sent = await attemptCall(ctx, workspace, "chat.postMessage", { ...words, blocks });
  return isRefusedForItsBlocks(sent) ? attemptCall(ctx, workspace, "chat.postMessage", words) : sent;
}

function messageOf(dm: Omit<MondayDm, "user">, quests: MondayQuests) {
  return { text: textOf(dm.hugs, quests), blocks: blocksOf(dm, quests) };
}

function stoppedMessageOf(dm: Id<"mondayDms">, workspace: string, { hugs, footer }: MondayDmContent) {
  const note = `🔕 *Done, no more Monday quests from me.*${hugs === null ? "" : " Your hugs recap still comes on Mondays."} Changed your mind? One press brings them back.`;
  return {
    text: [...(hugs?.lines.map(lineTextOf) ?? []), note].join("\n"),
    blocks: [
      ...(hugs === null ? [] : hugsBlocksOf(hugs)),
      { type: "section", text: mrkdwn(note) },
      { type: "actions", elements: [buttonOf({ label: "Turn Monday quests back on", command: { type: "resumeMondayQuests", dm } })] },
      ...footerBlocksOf(workspace, footer),
    ],
  };
}

function outcomeOf(sent: Attempt): "delivered" | "gone" | "failed" {
  return sent.kind === "delivered" || sent.kind === "gone" ? sent.kind : "failed";
}

function textOf(hugs: HugsSection | null, quests: MondayQuests) {
  return [...(hugs?.lines.map(lineTextOf) ?? []), quests.heading].join("\n");
}

function blocksOf({ dm, workspace, hugs, nudge, footer }: Omit<MondayDm, "user">, quests: MondayQuests) {
  return [
    ...(hugs === null ? [] : hugsBlocksOf(hugs)),
    { type: "section", text: mrkdwn(quests.heading) },
    checklistBlockOf(quests.checklist),
    ...(nudge === null ? [] : [{ type: "section", text: mrkdwn(escaped(nudge)) }]),
    { type: "actions", elements: buttonsOf(dm, quests) },
    ...footerBlocksOf(workspace, footer),
  ];
}

function footerBlocksOf(workspace: string, footer: MondayDmContent["footer"]) {
  return footerOf(workspace, footer).map((text) => ({ type: "context", elements: [mrkdwn(text)] }));
}

function footerOf(workspace: string, footer: MondayDmContent["footer"]) {
  return footer === null ? [] : [settingsFooterText(workspace, footer)];
}

function emojiLineBlockOf({ text, pictures }: RecapEmojiLine) {
  return { type: "context", elements: [...pictures.slice(0, mostPicturesInALine).map(({ url, name }) => ({ type: "image", image_url: url, alt_text: name })), mrkdwn(text)] };
}

function lineTextOf(line: RecapLine) {
  return typeof line === "string" ? line : `${line.text}${slackLink(line.link)}`;
}

function hugsBlocksOf({ lines, emojiLine }: HugsSection) {
  return [{ type: "section", text: mrkdwn(lines.map(lineTextOf).join("\n")) }, ...(emojiLine === null ? [] : [emojiLineBlockOf(emojiLine)]), { type: "divider" }];
}

function buttonsOf(dm: Id<"mondayDms">, { waiting, links }: MondayQuests) {
  const identify = waiting && links !== null ? [{ ...urlButtonOf({ label: "Identify them on the website", url: links.book, actionId: "dm-link:monday:book" }), style: "primary" }] : [];
  const seeQuests = links === null ? [] : [urlButtonOf({ label: "See your quests", url: links.quests, actionId: "dm-link:monday:quests" })];
  return [...identify, ...seeQuests, buttonOf({ label: "Stop Monday quests", command: { type: "stopMondayQuests", dm } })];
}
