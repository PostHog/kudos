// What the ported custom kudos emoji tests share, as today's testing/slackBackend.ts gave them: the App Home opened,
// a click and the picker's search through the front door, each ending at a stub as hugsTesting.ts's steps do, the sync
// run once now, and a database emptied for a test that starts a second workspace.
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../db/schema/index.ts";
import { notPorted } from "../notPorted.ts";
import { serviceRegistry } from "../registry.ts";
import type { TestBackend } from "../../testing/backend.ts";
import { blockSuggestion } from "../../testing/slackInteractions.ts";
import { appHomeOpened } from "../../testing/slackMessages.ts";
import type { Stack } from "../../testing/waiting.ts";
import { syncCustomEmoji } from "./customEmoji.ts";
import { customEmojiPickerAction } from "./customEmojiPicker.ts";
import { failureOf, sentTo } from "./hugsTesting.ts";

/**
 * The stacks a custom kudos emoji's walk reaches: S3's custom emoji directory and members, S4's kudos messages and
 * clicks, S17's App Home and S5's lines in it, S6's XP and the coins unlock, S7's store, wallet and the picker's search,
 * and the subscribers of `kudosGiven` whose bodies S5, S6, S7, S8, S9, S10, S11 and S14 port.
 */
export const reachedByTheStore: [Stack, ...Stack[]] = ["S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S14", "S17"];

const form = { contentType: "application/x-www-form-urlencoded" };

/** Today's `t.action(internal.slack.customEmoji.syncCustomEmoji, {})`: the sync job's body, run once now. */
export function syncCustomEmojiNow(t: TestBackend) {
  return t.operations.action("slack.customEmoji.syncCustomEmoji", (ctx) => syncCustomEmoji(ctx, {}));
}

/** The App Home opened on its Home tab. S17 registers `homeOpened`. */
export function homeOpened(t: TestBackend, user: string) {
  return sentTo(t, "homeOpened", "slack.appHome.homeOpened", appHomeOpened(user));
}

/**
 * A click in the App Home, as Slack's interactivity form. The front door acks a click no handler takes, so the step ends
 * at the home click handler's stub until it is registered, and at a stub it reaches after that.
 */
export async function clicked(t: TestBackend, interaction: string) {
  const path = "slack.interactivity.homeClick";
  if (!Object.hasOwn(serviceRegistry.slack.clicks ?? {}, "homeClick")) throw notPorted(path);
  return answered(t, path, interaction);
}

/** The custom kudos emoji picker's search: the options it asks for answer in the response. */
export function searched(t: TestBackend, user: string, typed: string) {
  return answered(t, "slack.customEmoji.customEmojiOptions", blockSuggestion(user, customEmojiPickerAction, typed));
}

async function answered(t: TestBackend, path: string, interaction: string) {
  const logged = t.logs.length;
  const response = await t.send("/interactivity", interaction, form);
  const failure = failureOf(response.status, t.logs.slice(logged), path);
  if (failure !== null) throw failure;
  return response;
}

const tables = (Object.values(schema) as unknown[]).filter((table): table is PgTable => is(table, PgTable));

/** Every row gone, as each of today's `testBackend()` calls started on an empty database, for a test that starts two. */
export async function startedOver(t: TestBackend) {
  await t.run(async ({ tx }) => {
    for (const table of tables) await tx.delete(table);
  });
}
