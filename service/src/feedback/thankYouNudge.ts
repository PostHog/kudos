// The module map's skeleton of convex/feedback/thankYouNudge.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import { countableContentValidator, messageRefValidator, type Mention, type WordSegment } from "../engine/messageEvent.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const thankYouNudgeFlag = { key: "thank-you-nudge", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

const gratitude = /\b(thanks?|thank\s?you|thankful|thanking|thx|thnx|ty|tysm|tyvm|appreciated?|appreciates|appreciation|grateful|gratitude|kudos|shout[\s-]?outs?|props|cheers|danke|merci|gracias)\b/iu;
const gratitudeEmoji = "pray";

export function thankYouNudgeText(kudosEmoji: string) {
  return `You can edit this message and add :${kudosEmoji}: to give a kudos and collect a hoggie.`;
}

export function mayThankSomeone({ author, mentions, emoji, text }: { author: string; mentions: Mention[]; emoji: string[]; text: string }) {
  return mentions.some((mention) => mention.kind === "person" && mention.user !== author) && (gratitude.test(text) || emoji.includes(gratitudeEmoji));
}

export function classifiedTextOf(segments: WordSegment[]) {
  return segments.map(classifiedTextOfSegment).join("").trim();
}

function classifiedTextOfSegment(segment: WordSegment) {
  switch (segment.kind) {
    case "text":
      return segment.text;
    case "person":
      return "@teammate";
    case "group":
      return "@team";
    case "broadcast":
      return `@${segment.range}`;
    case "channel":
      return "#channel";
    case "emoji":
      return segment.unicode ?? `:${segment.name}:`;
    case "link":
      return segment.label ?? "a link";
    case "break":
      return "\n";
  }
}

export const claimArgs = z.strictObject({ ref: messageRefValidator, author: z.string(), content: countableContentValidator });
export async function claim(ctx: MutationContext, args: z.infer<typeof claimArgs>): Promise<boolean> {
  throw notPorted("feedback.thankYouNudge.claim");
}
