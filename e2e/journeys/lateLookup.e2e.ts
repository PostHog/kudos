import { expect, receipt, staysEqual, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

const minuteMs = 60 * 1000;

test("a member Slack doesn't know yet at first gets their kudos at the lookup a minute on", { tags: ["@time"] }, async ({ slack, time }) => {
  const giver = await slack.member();
  const newcomer = slack.stranger();
  const thanks = await slack.post(giver, [mention(newcomer.id), text(" "), emoji("taco")]);

  // The app asks Slack about them at once, hears user_not_found, and gives nothing yet.
  await expect.poll(async () => (await slack.callsTo("users.info")).filter((call) => call.user === newcomer.id).length).toBe(1);
  await time.settle();
  await staysEqual(async () => ({ reactions: await slack.reactionsOn(thanks), replies: (await slack.ephemeralsTo(giver)).length }), { reactions: [], replies: 0 });

  await newcomer.join();
  await time.advance(minuteMs);
  await time.settle();

  await expect.poll(() => slack.reactionsOn(thanks)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map(receipt).at(-1)).toBe(`<@${newcomer.id}> got 1 kudos from you · +10 XP\n2 kudos left today`);
});
