import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { exposed, memberDecisionBeforeWriting, type Flag } from "../analytics/flags";
import { countableContentValidator, messageRefValidator, type Mention, type WordSegment } from "../engine/messageEvent";
import { kudosMessageOf } from "../parser/parser";
import { currentMemberOfUser } from "../workspace/directory";

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
      return `:${segment.name}:`;
    case "link":
      return segment.label ?? "a link";
    case "break":
      return "\n";
  }
}

export const claim = internalMutation({
  args: { ref: messageRefValidator, author: v.string(), content: countableContentValidator },
  handler: async (ctx, { ref, author, content }): Promise<boolean> => {
    const known = await currentMemberOfUser(ctx, ref.workspace, author);
    if (known === undefined) return false;
    const decision = await memberDecisionBeforeWriting(ctx, thankYouNudgeFlag, known.member);
    if (!decision.value) return false;
    await decision.keep();
    if ((await kudosMessageOf(ctx, content, { workspace: ref.workspace, giver: known.member })) !== null) return false;
    const earlier = await ctx.db
      .query("thankYouNudges")
      .withIndex("by_message", (q) => q.eq("workspace", ref.workspace).eq("conversation", ref.conversation).eq("message", ref.message))
      .unique();
    if (earlier !== null) return false;
    await ctx.db.insert("thankYouNudges", ref);
    await exposed(ctx, thankYouNudgeFlag, known.member, true);
    return true;
  },
});
