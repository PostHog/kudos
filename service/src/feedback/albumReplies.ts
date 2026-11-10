// The module map's skeleton of convex/feedback/albumReplies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { thoughtfulPacksGrantedEventValidator } from "../bus/events.ts";
import { messageRefValidator } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Line } from "./segments.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type AlbumReplyDestination = { kind: "beside"; conversation: string; threadRoot?: string; user: string } | { kind: "dm"; user: string };

export type AlbumReplyPicture = { url: string; label: string };

export type AlbumReplyRecipient = { headline: string; lines: string[]; hype: { picture: AlbumReplyPicture | null; line: string } | null };

export type AlbumReplyButton = { label: string; url: string; id: "album-open-packs" | "album-see-items" | `album-see-person:${MemberId}` };

export type AlbumReply = { workspace: string; destination: AlbumReplyDestination; recipients: AlbumReplyRecipient[]; more: number; waiting: string | null; buttons: AlbumReplyButton[]; gains: Line | null };

export const grantReplyValidator = z.strictObject({ message: messageRefValidator, told: z.union([z.literal("one-reply"), z.literal("album-reply")]) });

export const replyAfterTheGrantArgs = z.strictObject({ event: thoughtfulPacksGrantedEventValidator });
export async function replyAfterTheGrant(ctx: MutationContext, args: z.infer<typeof replyAfterTheGrantArgs>): Promise<null> {
  throw notPorted("feedback.albumReplies.replyAfterTheGrant");
}
export const replyAfterTheGrantJob = mutationJob("feedback.albumReplies.replyAfterTheGrant", replyAfterTheGrantArgs, replyAfterTheGrant);

export const albumReplyArgs = z.strictObject({ event: thoughtfulPacksGrantedEventValidator });
export async function albumReply(ctx: QueryContext, args: z.infer<typeof albumReplyArgs>): Promise<null | AlbumReply> {
  throw notPorted("feedback.albumReplies.albumReply");
}
