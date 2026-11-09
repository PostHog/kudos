import { expect, test, receipt } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

const hourMs = 60 * 60 * 1000;

test("the daily allowance refills at the giver's midnight", { tags: ["@time"] }, async ({ slack, time }) => {
  const [giver, first, second, third] = [await slack.member(), await slack.member(), await slack.member(), await slack.member()];
  await slack.post(giver, [mention(first), text(" "), mention(second), text(" "), mention(third), text(" "), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).length).toBe(1);

  // A new member's day sits at noon, so twelve hours on it is just past their midnight.
  await time.advance(12 * hourMs);
  const nextDay = await slack.post(giver, [mention(first), text(" "), emoji("taco")]);

  await expect.poll(() => slack.reactionsOn(nextDay)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map(receipt).at(-1)).toBe(`<@${first}> got 1 kudos from you · +10 XP\n2 kudos left today`);
});
