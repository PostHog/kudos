import { expect, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("a thank-you with the kudos emoji marks the message and tells the giver privately what's left today", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];

  const message = await slack.post(giver, [text("thanks "), mention(recipient), text(" "), emoji("taco")]);

  await expect.poll(() => slack.reactionsOn(message)).toEqual(["taco"]);
  await expect.poll(() => slack.ephemeralsTo(giver)).toEqual([{ channel: message.channel, user: giver, text: `<@${recipient}> got 1 kudos from you. You have 2 kudos left today.` }]);
});

test("the daily allowance runs out: the last kudos says so, and a thank-you beyond it waits under an hourglass", async ({ slack }) => {
  const [giver, first, second, third] = [await slack.member(), await slack.member(), await slack.member(), await slack.member()];

  await slack.post(giver, [mention(first), text(" "), mention(second), text(" "), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).length).toBe(1);
  await slack.post(giver, [mention(third), text(" "), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).length).toBe(2);
  const tooMuch = await slack.post(giver, [mention(first), text(" "), emoji("taco")]);

  await expect.poll(() => slack.reactionsOn(tooMuch)).toEqual(["hourglass_flowing_sand"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map((reply) => reply.text)).toEqual([
    `<@${first}> and <@${second}> got 1 kudos from you. You have 1 kudos left today.`,
    `<@${third}> got 1 kudos from you. That was your last kudos for today, and you'll have 3 more at midnight.`,
    "This needs 1 kudos (1 person × 1 kudos emoji), but you have 0 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again.",
  ]);
});
