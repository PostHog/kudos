// Ported from convex/feedback/replies.test.ts: the copy of the replies a kudos message that gives nothing gets.
import { describe, expect, test } from "vitest";
import type { Mention } from "../engine/messageEvent.ts";
import { renderReply, type SkippedMention } from "./replies.ts";
import type { Line, Segment } from "./segments.ts";

describe("R36 R37: the copy", () => {
  test("Over allowance for one person", () => {
    const lines = renderReply({ kind: "over-allowance", outcome: { cost: 4, recipients: 1, perRecipient: 4, left: 0 }, base: 3 });

    expect(plain(lines)).toEqual([
      "This needs 4 kudos (1 person × 4 kudos emoji), but you have 0 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again.",
    ]);
  });

  test("Invalid with one reason, given once however many mentions share it", () => {
    const lines = renderReply({ kind: "invalid", outcome: { skipped: [skipped(person("U_BOT"), "bot"), skipped(person("U_OTHER_BOT"), "bot")] } });

    expect(plain(lines)).toEqual(["Nobody in this message can receive kudos: bots don't receive kudos. Tag a teammate and edit the message to try again."]);
  });

  test("Invalid names each person who isn't an active member", () => {
    const lines = renderReply({ kind: "invalid", outcome: { skipped: [skipped(person("U_DAVE"), "not-a-member"), skipped(person("U_ERIN"), "not-a-member")] } });

    expect(plain(lines)).toEqual([
      "Nobody in this message can receive kudos: @U_DAVE isn't an active member of this workspace and @U_ERIN isn't an active member of this workspace. Tag a teammate and edit the message to try again.",
    ]);
  });
});

function person(user: string): Mention {
  return { kind: "person", user };
}

function skipped(mention: Mention, reason: SkippedMention["reason"]): SkippedMention {
  return { mention, reason };
}

function plain(lines: Line[]) {
  return lines.map((line) => line.map(plainSegment).join(""));
}

function plainSegment(segment: Segment) {
  if ("text" in segment) return segment.text;
  if ("link" in segment) return segment.link.label;
  return `@${mentionName(segment.mention)}`;
}

function mentionName(mention: Mention) {
  if (mention.kind === "person") return mention.user;
  return mention.kind === "group" ? mention.group : mention.range;
}
