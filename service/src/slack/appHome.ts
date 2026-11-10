// App Home, as today's convex/slack/appHome.ts: an opening of the Home tab is reported and the member's home published
// to Slack, retried through Slack's failures at most three times. `homeOpened` is the front door's `homeOpened` handler,
// today's `receipts.receiveHomeOpened`: the front door keeps the event's receipt in the same transaction, so a
// redelivered opening publishes once. `publishHome` is a job, as today's scheduled action was.
import type { HomeFacts } from "../engine/home.ts";
import { homeOf } from "../engine/home.ts";
import type { Command } from "../commands/commands.ts";
import { renderHome, type Choice, type HomeLine, type HomeView } from "../feedback/home.ts";
import { shownHomeOf, type ShownHome } from "../feedback/homes.ts";
import { homeRefusalValidator, type HomeRefusal } from "../feedback/homeRefusal.ts";
import { recordUsage, recordUsageWithoutBlocking } from "../analytics/usage.ts";
import { groupsBoardOf } from "../leaderboard/groupBoards.ts";
import { myGroupBoardViewOf } from "../leaderboard/myGroupBoard.ts";
import { xpLevelsOnFor, xpLevelsShownIn, xpLevelsShownTo } from "../progression/xpLevels.ts";
import { frontDoorLinksOf } from "../website/link.ts";
import { lookup } from "../workspace/directory.ts";
import { buttonOf, mrkdwn, plainText, urlButtonOf } from "./blocks.ts";
import { encodeHomeAction } from "./interactivity.ts";
import { attemptArgs, enqueueAt, failedAttempt, sendOnce, slackTextOf, tryAtMostThreeTimes } from "./delivery.ts";
import { lookUpUser, refreshUser } from "./directory.ts";
import { customEmojiPickerOf } from "./customEmojiPicker.ts";
import type { EventCallback } from "./frontDoor.ts";
import { groupOptionsOf, groupSelectOf, optionListsOf } from "./groupPicker.ts";
import { receiveHomeOpenedArgs } from "./receipts.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";

export type HomeOpened = { type: "app_home_opened"; user: string; tab: "home" | "messages" };

export function isHomeTabOpened(event: { type: string }): event is HomeOpened {
  return event.type === "app_home_opened" && (event as HomeOpened).tab === "home";
}

type Opening = { workspace: string; user: string; at: number };

export async function reportHomeOpened(ctx: MutationContext, { workspace, user, at }: Opening): Promise<"reported" | "unknown-person"> {
  const person = await lookup(ctx, workspace, user);
  if (person === undefined) return "unknown-person";
  if (person.kind !== "member") return "reported";
  await recordUsage(ctx, { kind: "appHomeOpened", workspace, member: person.member, at });
  await xpLevelsShownTo(ctx, person.member);
  return "reported";
}

export const reportLookedUpHomeOpeningArgs = z.strictObject({ workspace: z.string(), user: z.string(), at: zv.number() });
export async function reportLookedUpHomeOpening(ctx: MutationContext, opening: z.infer<typeof reportLookedUpHomeOpeningArgs>): Promise<void> {
  await reportHomeOpened(ctx, opening);
}

/**
 * The front door's `homeOpened` handler: today's `receipts.receiveHomeOpened`, given the event as today's event route
 * read it. Its arguments pass today's validator first, so an event without them fails as the mutation's call did.
 */
export async function homeOpened(ctx: MutationContext, envelope: EventCallback): Promise<void> {
  const { workspace, user, at } = receiveHomeOpenedArgs.parse({ workspace: envelope.team_id, eventId: envelope.event_id, user: envelope.event.user, at: (envelope.event_time as number) * 1000 });
  const opening = { workspace, user, at };
  const reported = await reportHomeOpened(ctx, opening);
  await ctx.jobs.enqueue(publishHomeJob, {
    workspace,
    user,
    opened: await isLevelShownToOpener(ctx, opening),
    ...(reported === "unknown-person" && { unreportedOpeningAt: at }),
  });
}

async function isLevelShownToOpener(ctx: MutationContext, { workspace, user }: { workspace: string; user: string }) {
  const person = await lookup(ctx, workspace, user);
  return person?.kind === "member" ? xpLevelsOnFor(ctx, person.member) : xpLevelsShownIn(ctx, workspace);
}

export const publishHomeArgs = z.strictObject({ workspace: z.string(), user: z.string(), opened: z.optional(z.boolean()), refused: z.optional(homeRefusalValidator), unreportedOpeningAt: z.optional(zv.number()), ...attemptArgs });
export async function publishHome(ctx: ActionContext, { attempt = 1, unreportedOpeningAt, ...home }: z.infer<typeof publishHomeArgs>): Promise<void> {
  let unreported = unreportedOpeningAt;
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    async (attempt) => {
      const desired = await desiredHomeOf(ctx, home);
      if (desired.kind === "unavailable") return failedAttempt(attempt, ctx.clock.now(), desired.retryAfterMs);
      if (unreported !== undefined) {
        const at = unreported;
        await recordUsageWithoutBlocking(() => ctx.run.mutation("slack.appHome.reportLookedUpHomeOpening", (m) => reportLookedUpHomeOpening(m, { workspace: home.workspace, user: home.user, at })));
        unreported = undefined;
      }
      const { view } = desired;
      const retry = await sendOnce(ctx, home.workspace, "views.publish", { user_id: home.user, view }, attempt);
      if (retry === null && (await changedWhileSent(ctx, home, view))) {
        await ctx.run.mutation(`${publishHomeJob.name}.again`, ({ jobs }) => jobs.enqueue(publishHomeJob, { workspace: home.workspace, user: home.user }));
      }
      return retry;
    },
    (retry) =>
      enqueueAt(
        ctx,
        publishHomeJob,
        {
          ...home,
          ...(unreported !== undefined && { unreportedOpeningAt: unreported }),
          attempt: retry.attempt,
        },
        retry.at,
      ),
  );
}
export const publishHomeJob = actionJob("slack.appHome.publishHome", publishHomeArgs, publishHome);

type Home = { workspace: string; user: string; opened?: boolean; refused?: HomeRefusal };

type Unavailable = { kind: "unavailable"; retryAfterMs?: number };

async function desiredHomeOf(ctx: ActionContext, home: Home): Promise<{ kind: "view"; view: SlackHomeView } | Unavailable> {
  const facts = await homeFactsOf(ctx, home);
  if (facts.kind === "unavailable") return facts;
  const frontDoor = await ctx.run.query("website.link.frontDoorLinksOf", (q) => frontDoorLinksOf(q, { workspace: home.workspace, user: home.user }));
  const shown = await ctx.run.mutation("feedback.homes.shownHomeOf", (m) => shownHomeOf(m, { workspace: home.workspace, user: home.user, frontDoor: frontDoor !== null, ...(home.refused !== undefined && { refused: home.refused }) }));
  return { kind: "view", view: homeView(renderHome(facts, await withGroupBoards(ctx, home, shown), frontDoor)) };
}

async function withGroupBoards(ctx: ActionContext, { workspace, user }: Home, home: ShownHome | null): Promise<ShownHome | null> {
  if (home?.shown.tab !== "leaderboard") return home;
  const viewer = { workspace, viewer: user, period: home.shown.period };
  const groups = await ctx.run.query("leaderboard.groupBoards.groupsBoardOf", (q) => groupsBoardOf(q, viewer));
  const myGroup = await ctx.run.query("leaderboard.myGroupBoard.myGroupBoardViewOf", (q) => myGroupBoardViewOf(q, viewer));
  return { ...home, shown: { ...home.shown, groups, myGroup } };
}

async function changedWhileSent(ctx: ActionContext, { workspace, user, refused }: Home, sent: SlackHomeView) {
  const desired = await desiredHomeOf(ctx, { workspace, user, ...(refused !== undefined && { refused }) });
  return desired.kind === "view" && JSON.stringify(desired.view) !== JSON.stringify(sent);
}

async function homeFactsOf(ctx: ActionContext, { workspace, user, opened }: Home): Promise<HomeFacts | Unavailable> {
  const refreshed = opened ? await refreshUser(ctx, workspace, user) : undefined;
  const known = await ctx.run.query("engine.home.homeOf", (q) => homeOf(q, { workspace, user }));
  if (known !== null) return known;
  const lookUp = refreshed ?? (await lookUpUser(ctx, workspace, user));
  if (lookUp.kind === "failed") return { kind: "unavailable", ...(lookUp.retryAfterMs !== undefined && { retryAfterMs: lookUp.retryAfterMs }) };
  return (await ctx.run.query("engine.home.homeOf", (q) => homeOf(q, { workspace, user }))) ?? { kind: "unavailable" };
}

type SlackHomeView = ReturnType<typeof homeView>;

function homeView({ tabBar, title, groups }: HomeView) {
  const tabs = tabBar === undefined ? [] : [buttonsOf(tabBar)];
  const header = { type: "header", text: plainText(title) };
  const body = groups.flatMap((group, index) => [...(index > 0 ? [divider] : []), ...group.map(blockOf)]);
  return { type: "home", blocks: [...tabs, header, ...body] };
}

const divider = { type: "divider" };

const settingsPick = JSON.stringify({ type: "pickPrimaryGroup", surface: "settings" });

function blockOf(line: HomeLine) {
  if (line.kind === "fields") return { type: "section", fields: line.fields.map(mrkdwn) };
  if (line.kind === "choices") return buttonsOf(line.choices);
  if (line.kind === "lines") return { type: "section", text: mrkdwn(slackTextOf(line.lines)) };
  if (line.kind === "hint") return { type: "context", elements: [mrkdwn(line.text)] };
  if (line.kind === "action") return { type: "section", text: mrkdwn(line.text), accessory: buttonOf(line.action) };
  if (line.kind === "pick-channel") return { type: "section", text: mrkdwn(line.text), accessory: channelPickerOf(line) };
  if (line.kind === "pick") return { type: "section", text: mrkdwn(line.text), accessory: pickerOf(line) };
  if (line.kind === "pick-group") return { type: "section", text: mrkdwn(line.text), accessory: groupSelectOf(settingsPick, line.groups, line.picked) };
  if (line.kind === "pick-groups") return { type: "section", text: mrkdwn(line.text), accessory: groupPickerOf(line) };
  if (line.kind === "pick-custom-emoji") return { type: "section", text: mrkdwn(line.text), accessory: customEmojiPickerOf(line) };
  if (line.kind === "link") return { type: "section", text: mrkdwn(`<${line.url}|${line.label}>`) };
  if (line.kind === "links") return { type: "actions", elements: line.links.map(linkButtonOf) };
  return { type: "section", text: mrkdwn(line.text) };
}

function buttonsOf(choices: Choice[]) {
  return { type: "actions", elements: choices.map(({ selected, ...action }) => ({ ...buttonOf(action), ...(selected && { style: "primary" }) })) };
}

function linkButtonOf({ label, url }: { label: string; url: string }, index: number) {
  return urlButtonOf({ label, url, actionId: `website-link-${index}` });
}

function pickerOf({ id, placeholder, options }: Extract<HomeLine, { kind: "pick" }>) {
  const selectOptions = options.map(({ label, command }) => ({ text: plainText(label), value: encodeHomeAction(command) }));
  const initial = options.findIndex(({ selected }) => selected);
  return { type: "static_select", action_id: id, placeholder: plainText(placeholder), ...optionListsOf(selectOptions, "Options"), ...(initial >= 0 && { initial_option: selectOptions[initial] }) };
}

function channelPickerOf({ picks, picked }: Extract<HomeLine, { kind: "pick-channel" }>) {
  return { type: "channels_select", action_id: picks, placeholder: plainText("Pick a channel"), ...(picked !== null && { initial_channel: picked }) };
}

function groupPickerOf({ groups, picked }: Extract<HomeLine, { kind: "pick-groups" }>) {
  const options = groupOptionsOf(groups);
  const initial = options.filter(({ value }) => picked.includes(value));
  return {
    type: "multi_static_select",
    action_id: "setGroupMode" satisfies Command["type"],
    placeholder: plainText("Pick groups"),
    ...optionListsOf(options),
    ...(initial.length > 0 && { initial_options: initial }),
  };
}
