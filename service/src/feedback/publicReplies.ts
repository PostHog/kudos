// The module map's skeleton of convex/feedback/publicReplies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { levelReachedEventValidator } from "../bus/events.ts";
import { messageRefValidator, type MessageRef } from "../engine/messageEvent.ts";
import { type MemberId } from "../workspace/directory.ts";
import { segmentValidator, type Line } from "./segments.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
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
export async function desired(ctx: QueryContext, args: z.infer<typeof desiredArgs>): Promise<null | { sections: { member: Id<"members">; line: { text: string } | { mention: { user: string; kind: "person" } | { kind: "group"; group: string } | { kind: "broadcast"; range: string } } | { link: { url: string; label: string } }[]; key: string; about: "level" | "achievement" }[]; _id: Id<"publicReplies">; _creationTime: number; threadTs?: string; workspace: string; conversation: string; message: string; channel: string; version: number; shown: { state: "unposted" } | { state: "posting" } | { state: "sending" } | { state: "posted"; ts: string } } | { sections: { member: Id<"members">; line: { text: string } | { mention: { user: string; kind: "person" } | { kind: "group"; group: string } | { kind: "broadcast"; range: string } } | { link: { url: string; label: string } }[]; key: string; about: "level" | "achievement" }[]; _id: Id<"publicReplies">; _creationTime: number; workspace: string; channel: string; version: number; shown: { state: "unposted" } | { state: "posting" } | { state: "sending" } | { state: "posted"; ts: string }; reached: { member: Id<"members">; level: number } } | { sections: { member: Id<"members">; line: { text: string } | { mention: { user: string; kind: "person" } | { kind: "group"; group: string } | { kind: "broadcast"; range: string } } | { link: { url: string; label: string } }[]; key: string; about: "level" | "achievement" }[]; _id: Id<"publicReplies">; _creationTime: number; workspace: string; channel: string; version: number; shown: { state: "unposted" } | { state: "posting" } | { state: "sending" } | { state: "posted"; ts: string }; summary: Id<"tierSummaries"> }> {
  throw notPorted("feedback.publicReplies.desired");
}

export const recordPostedArgs = z.strictObject({ reply: zv.id("publicReplies"), ts: z.string() });
export async function recordPosted(ctx: MutationContext, args: z.infer<typeof recordPostedArgs>): Promise<number> {
  throw notPorted("feedback.publicReplies.recordPosted");
}

export const startSendingArgs = z.strictObject({ reply: zv.id("publicReplies") });
export async function startSending(ctx: MutationContext, args: z.infer<typeof startSendingArgs>): Promise<boolean> {
  throw notPorted("feedback.publicReplies.startSending");
}

export const sendingFailedArgs = z.strictObject({ reply: zv.id("publicReplies") });
export async function sendingFailed(ctx: MutationContext, args: z.infer<typeof sendingFailedArgs>): Promise<void> {
  throw notPorted("feedback.publicReplies.sendingFailed");
}

export const stopPostingArgs = z.strictObject({ reply: zv.id("publicReplies") });
export async function stopPosting(ctx: MutationContext, args: z.infer<typeof stopPostingArgs>): Promise<void> {
  throw notPorted("feedback.publicReplies.stopPosting");
}

export const stopSendingArgs = z.strictObject({ reply: zv.id("publicReplies") });
export async function stopSending(ctx: MutationContext, args: z.infer<typeof stopSendingArgs>): Promise<void> {
  throw notPorted("feedback.publicReplies.stopSending");
}

export function linesOf(reply: Pick<Doc<"publicReplies">, "sections">): Line[] {
  return reply.sections.map(({ line }) => line);
}
