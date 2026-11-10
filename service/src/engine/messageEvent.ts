import { z } from "zod";
import { zv } from "../values.ts";

export const mentionValidator = z.union([
  z.strictObject({ kind: z.literal("person"), user: z.string() }),
  z.strictObject({ kind: z.literal("group"), group: z.string() }),
  z.strictObject({ kind: z.literal("broadcast"), range: z.string() }),]
);

const annotationValueValidator = z.union([z.string(), zv.number(), z.boolean()]);

export const annotationsValidator = zv.record(z.string(), z.union([annotationValueValidator, zv.record(z.string(), annotationValueValidator)]));

export const messageRefValidator = z.strictObject({ workspace: z.string(), conversation: z.string(), message: z.string() });

const styleFlag = z.optional(z.literal(true));

export const wordSegmentValidator = z.union([
  z.strictObject({ kind: z.literal("text"), text: z.string(), bold: styleFlag, italic: styleFlag, strike: styleFlag, code: styleFlag }),
  z.strictObject({ kind: z.literal("person"), user: z.string() }),
  z.strictObject({ kind: z.literal("group"), group: z.string() }),
  z.strictObject({ kind: z.literal("channel") }),
  z.strictObject({ kind: z.literal("broadcast"), range: z.string() }),
  z.strictObject({ kind: z.literal("emoji"), name: z.string(), unicode: z.optional(z.string()) }),
  z.strictObject({ kind: z.literal("link"), url: z.string(), label: z.optional(z.string()) }),
  z.strictObject({ kind: z.literal("break") }),]
);

export const visibilityValidator = z.union([z.literal("public"), z.literal("private")]);

export const wordsValidator = z.strictObject({ segments: z.array(wordSegmentValidator), visibility: visibilityValidator });

export const countableContentValidator = z.strictObject({ mentions: z.array(mentionValidator), emoji: z.array(z.string()), mentionsBeforeEmoji: z.optional(z.array(zv.number())) });

export const messageEventValidator = z.strictObject({
  kind: z.union([z.literal("posted"), z.literal("edited")]),
  ref: messageRefValidator,
  threadRoot: z.optional(z.string()),
  author: z.string(),
  revision: z.int64(),
  at: zv.number(),
  content: countableContentValidator.extend({ text: z.string() }),
  words: wordsValidator,
});

export const fetchedMessageValidator = z.strictObject({
  ref: messageRefValidator,
  author: z.string(),
  revision: z.int64(),
  edited: z.boolean(),
  content: messageEventValidator.shape.content,
  segments: z.array(wordSegmentValidator),
});

export const messageDeletedValidator = z.strictObject({ kind: z.literal("deleted"), ref: messageRefValidator, wasKudosCandidate: z.boolean() });

export type ChatUserId = string;
export type Mention = z.infer<typeof mentionValidator>;
export type Annotations = z.infer<typeof annotationsValidator>;
export type MessageRef = z.infer<typeof messageRefValidator>;
export type MessageEvent = z.infer<typeof messageEventValidator>;
export type MessageContent = MessageEvent["content"];
export type FetchedMessage = z.infer<typeof fetchedMessageValidator>;
export type MessageDeleted = z.infer<typeof messageDeletedValidator>;
export type WordSegment = z.infer<typeof wordSegmentValidator>;
export type Words = z.infer<typeof wordsValidator>;
export type Visibility = z.infer<typeof visibilityValidator>;
export type CountableContent = z.infer<typeof countableContentValidator>;

export function countableOf({ mentions, emoji, mentionsBeforeEmoji }: CountableContent): CountableContent {
  return { mentions, emoji, ...(mentionsBeforeEmoji && { mentionsBeforeEmoji }) };
}

export function isSameMessage(one: MessageRef, other: MessageRef): boolean {
  return one.workspace === other.workspace && one.conversation === other.conversation && one.message === other.message;
}
