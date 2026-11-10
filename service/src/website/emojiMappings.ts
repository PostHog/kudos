// The module map's skeleton of convex/website/emojiMappings.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MappingTarget, SlackEmojiMappings } from "../album/emojiMappings.ts";
import { z } from "zod";
import { zv } from "../values.ts";

export type ShownTarget = Exclude<MappingTarget, { kind: "hype" }> | { kind: "hype"; person: string };

export type MappablePerson = { key: string; name: string };

export type EmojiMappings = { kind: "mappings"; emoji: { name: string; image: string; mapping: ShownTarget | null }[]; people: MappablePerson[] } & Omit<SlackEmojiMappings, "emoji">;

export type EmojiMappingsRead = { kind: "off" } | EmojiMappings;

export type EmojiMappingAnswer = { kind: "mapped" } | { kind: "refused" };

const placeValidator = z.union([
  z.strictObject({ kind: z.literal("team"), team: z.string() }),
  z.strictObject({ kind: z.literal("milestone"), milestone: z.string() }),
  z.strictObject({ kind: z.literal("level"), level: zv.number() }),
  z.strictObject({ kind: z.literal("hype"), person: z.string() }),
  z.strictObject({ kind: z.literal("random") }),
  z.strictObject({ kind: z.literal("unmapped") }),]
);
