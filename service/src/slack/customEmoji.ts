// The workspace's custom emoji, listed from Slack into the directory: every day, and 30 seconds after an `emoji_changed`
// event. The custom kudos emoji picker searches them. Today's convex/slack/customEmoji.ts, and the picker's options from
// convex/slack/interactivity.ts.
import { ReportableError } from "../analytics/exceptions.ts";
import { customKudosEmojiOptions } from "../store/customKudosEmoji.ts";
import { beginCustomEmojiListing, claimCustomEmojiRefresh, forgetUnlistedCustomEmoji, keepCustomEmoji, type CustomEmoji } from "../workspace/customEmoji.ts";
import { customEmojiOptionOf } from "./customEmojiPicker.ts";
import { textOf, workspaceOfToken } from "./directory.ts";
import type { EventCallback, Handled, OptionsRequest } from "./frontDoor.ts";
import { nextRateLimitedAttempt, readSlack, retryDelayOf, slackErrorCodeOf } from "./webApi.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext, QueryContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";

type EmojiChanged = { type: "emoji_changed" };

type Listing = { kind: "listed"; emoji: CustomEmoji[]; scopeMissing?: true } | { kind: "rate-limited"; retryAfterMs: number };

const aliasPrefix = "alias:";
const withoutScope = "missing_scope";
const refreshAfterMs = 30_000;
const keptPerWrite = 1_000;
const aliasHopsFollowed = 5;

export function isEmojiChanged(event: { type: string }): event is EmojiChanged {
  return event.type === "emoji_changed";
}

export function emojiChangeOf(workspace: unknown, eventId: unknown) {
  const [team, receipt] = [textOf(workspace), textOf(eventId)];
  return team === undefined || receipt === undefined ? null : { workspace: team, eventId: receipt };
}

/** The front door's `emojiChanged` event: the custom emoji are listed again 30 seconds later, once for a burst. */
export async function emojiChanged(ctx: MutationContext, envelope: EventCallback): Promise<Handled> {
  const change = emojiChangeOf(envelope.team_id, envelope.event_id);
  if (change === null) return "ignored";
  await refreshCustomEmojiLater(ctx, change.workspace);
}

export async function refreshCustomEmojiLater(ctx: MutationContext, workspace: string): Promise<void> {
  if (await claimCustomEmojiRefresh(ctx, workspace, refreshAfterMs)) await ctx.jobs.enqueue(syncCustomEmojiJob, {}, { after: refreshAfterMs });
}

export const syncCustomEmojiArgs = z.strictObject({ attempt: z.optional(zv.number()) });
export async function syncCustomEmoji(ctx: ActionContext, { attempt = 1 }: z.infer<typeof syncCustomEmojiArgs>): Promise<void> {
  await listCustomEmoji(ctx, attempt);
}
export const syncCustomEmojiJob = actionJob("slack.customEmoji.syncCustomEmoji", syncCustomEmojiArgs, syncCustomEmoji);

/** The custom kudos emoji picker's options: the custom emoji the admin may pick, as they typed them. */
export async function customEmojiOptions(ctx: QueryContext, { team, user, value }: OptionsRequest): Promise<unknown[]> {
  const names = await customKudosEmojiOptions(ctx, { workspace: team.id, user: user.id, typed: value });
  return names.map(customEmojiOptionOf);
}

async function listCustomEmoji(ctx: ActionContext, attempt: number) {
  const workspace = await workspaceOfToken();
  const listing = await ctx.run.mutation("workspace.customEmoji.beginCustomEmojiListing", (m) => beginCustomEmojiListing(m, { workspace }));
  const listed = await customEmojiListed();
  if (listed.kind === "rate-limited") {
    const next = nextRateLimitedAttempt(attempt, "emoji.list");
    await ctx.run.mutation(`${syncCustomEmojiJob.name}.retry`, ({ jobs }) => jobs.enqueue(syncCustomEmojiJob, { attempt: next }, { after: listed.retryAfterMs }));
    return;
  }
  const { scopeMissing } = listed;
  for (const emoji of writesOf(listed.emoji)) {
    const kept = await ctx.run.mutation("workspace.customEmoji.keepCustomEmoji", (m) => keepCustomEmoji(m, { workspace, emoji, listing, ...(scopeMissing && { scopeMissing }) }));
    if (!kept) return;
  }
  await ctx.run.mutation("workspace.customEmoji.forgetUnlistedCustomEmoji", (m) => forgetUnlistedCustomEmoji(m, { workspace, listing }));
}

async function customEmojiListed(): Promise<Listing> {
  const answer = await readSlack<{ emoji?: unknown }>("emoji.list", {});
  if (answer.ok) return { kind: "listed", emoji: customEmojiOf(answer.emoji) };
  if (answer.error === withoutScope) return { kind: "listed", emoji: [], scopeMissing: true };
  if (answer.error === "ratelimited") return { kind: "rate-limited", retryAfterMs: retryDelayOf(answer) };
  throw new ReportableError(`Slack emoji.list failed: ${slackErrorCodeOf(answer.error)}`);
}

/** Slack's listing as the directory keeps it: each name with its image, an alias with its original's; one without an https image is left out. */
export function customEmojiOf(listed: unknown): CustomEmoji[] {
  if (typeof listed !== "object" || listed === null || Array.isArray(listed)) throw new ReportableError("Slack emoji.list answered without an emoji list");
  const values = new Map(Object.entries(listed));
  return [...values].flatMap(([name, value]) => {
    const original = originalOf(values, name, value, aliasHopsFollowed);
    if (original === undefined) return [];
    return [{ name, image: original.image, ...(original.name !== name && { aliasOf: original.name }) }];
  });
}

function originalOf(values: Map<string, unknown>, name: string, value: unknown, hopsLeft: number): { name: string; image: string } | undefined {
  const text = textOf(value);
  if (!text?.startsWith(aliasPrefix)) {
    const image = httpsUrlOf(text);
    return image === undefined ? undefined : { name, image };
  }
  const aliased = text.slice(aliasPrefix.length);
  return hopsLeft === 0 ? undefined : originalOf(values, aliased, values.get(aliased), hopsLeft - 1);
}

function httpsUrlOf(value: unknown) {
  if (typeof value !== "string" || !URL.canParse(value)) return undefined;
  return new URL(value).protocol === "https:" ? value : undefined;
}

/** The listing in writes of at most 1,000 emoji each, and always one write, so an empty listing still reaches its end. */
export function writesOf(emoji: CustomEmoji[]) {
  const writes = [];
  for (let start = 0; start === 0 || start < emoji.length; start += keptPerWrite) writes.push(emoji.slice(start, start + keptPerWrite));
  return writes;
}
