// The module map's skeleton of convex/website/emojiWizard.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type AppEmojiKind, type SlackEmojiMatch } from "../album/emojiWizard.ts";
import type { EmojiMapper } from "../album/records.ts";
import type { ShownTarget } from "./emojiMappings.ts";

export type SlackEmojiMatches = { kind: "matches"; matches: SlackEmojiMatch[] };

export type SlackEmojiMatchesRead = { kind: "off" } | SlackEmojiMatches;

export type EmojiMappedBy = { by: EmojiMapper["as"]; name: string };

export type AppEmoji = { key: string; kind: AppEmojiKind; name: string; from: string; picture: string; holders: number; slack: { image: string; setBy: EmojiMappedBy | null } | null; place: ShownTarget };

export type AppEmojis = { kind: "app-emojis"; emojis: AppEmoji[]; more: boolean; emojiPage: string | null };

export type AppEmojisRead = { kind: "off" } | AppEmojis;

export type MyEmojiMappingAnswer = { kind: "mapped" } | { kind: "refused" };
