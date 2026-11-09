import { expect, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";
import { untilNext } from "../time.ts";

const hourMs = 60 * 60 * 1000;

// The quest lines of a giver's reply: what follows the receipt, without the album's item lines.
const questLinesOf = (reply: string) => reply.split("\n").slice(1).filter((line) => !/kudos left today$|last kudos for today|^🎁/.test(line));

// Each week draws one of these for the kudos side; a kudos to someone never thanked before moves or finishes any of
// them, and the reply says which.
const drawnQuestLine = new RegExp(
  [
    "^Done: (Give a kudos to someone|Thank someone you haven't thanked before|Thank someone you haven't thanked in the last 30 days) · \\+20 XP and an unidentified Hoggie$",
    "^(Thank someone on two different days|Thank 3 people in one day|Thank 2 people you haven't thanked before) · [🟩⬜]+ 1 of [23] (days|people)$",
  ].join("|"),
  "u",
);

test("onboarding quests and then a quest drawn each week show their progress in the giver's reply", { tags: ["@time"] }, async ({ slack, time }) => {
  const [giver, first, second, fresh] = [await slack.member(), await slack.member(), await slack.member(), await slack.member()];
  const replies = async () => (await slack.ephemeralsTo(giver)).map((reply) => String(reply.text));
  const give = async (to: string) => {
    const before = (await replies()).length;
    await slack.post(giver, [text("thanks "), mention(to), text(" "), emoji("taco")]);
    await expect.poll(async () => (await replies()).length).toBe(before + 1);
    return questLinesOf((await replies()).at(-1)!);
  };

  // The onboarding quests come first: a kudos, someone new, and two different days.
  expect(await give(first)).toEqual(["Done: Give a kudos to someone · +50 XP and an unidentified Hoggie", "Thank someone on two different days · 🟩⬜ 1 of 2 days"]);
  expect(await give(second)).toEqual(["Done: Thank someone new · +50 XP and an unidentified Hoggie"]);
  await time.advance(24 * hourMs);
  expect(await give(first)).toEqual(["Done: Thank someone on two different days · +50 XP and an unidentified Hoggie"]);

  // With onboarding done, the next week draws a quest, and the first kudos of that week moves it.
  await time.advance(untilNext((await time.now()) + slack.hoursAheadOf(giver) * hourMs, 1, 10));
  await time.runCron("quests.newWeek.sweep");
  expect(await give(fresh)).toEqual([expect.stringMatching(drawnQuestLine)]);
});
