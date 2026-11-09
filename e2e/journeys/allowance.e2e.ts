import { expect, test, receipt } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

const hourMs = 60 * 60 * 1000;
const minuteMs = 60 * 1000;

test("the daily allowance refills at the giver's midnight, not UTC's", { tags: ["@time"] }, async ({ slack, time }) => {
  // A member made at midnight UTC sits at noon twelve hours ahead of it, so their midnight comes twelve hours before UTC's.
  const now = await time.now();
  await time.advance(Math.ceil(now / (24 * hourMs)) * 24 * hourMs - now);
  await time.settle();
  const [giver, first, second, third] = [await slack.member(), await slack.member(), await slack.member(), await slack.member()];
  expect(slack.hoursAheadOf(giver)).toBe(12);
  await slack.post(giver, [mention(first), text(" "), mention(second), text(" "), mention(third), text(" "), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).length).toBe(1);

  // A minute before their midnight, the allowance is still spent.
  await time.advance(12 * hourMs - minuteMs);
  await time.settle();
  const lateThatDay = await slack.post(giver, [mention(first), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(lateThatDay)).toEqual(["hourglass_flowing_sand"]);

  // A minute after it, eleven hours before UTC's, the allowance is full again.
  await time.advance(2 * minuteMs);
  await time.settle();
  const nextDay = await slack.post(giver, [mention(first), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(nextDay)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map(receipt).at(-1)).toBe(`<@${first}> got 1 kudos from you · +10 XP\n2 kudos left today`);
});
