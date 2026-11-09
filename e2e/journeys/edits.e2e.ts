import { expect, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("editing the kudos emoji into a message gives its kudos", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];
  const message = await slack.post(giver, [text("thanks "), mention(recipient)]);

  await slack.edit(giver, message, [text("thanks "), mention(recipient), text(" "), emoji("taco")]);

  await expect.poll(() => slack.reactionsOn(message)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map((reply) => reply.text)).toEqual([`<@${recipient}> got 1 kudos from you. You have 2 kudos left today.`]);
});

test("editing a message that already gave kudos changes nothing, and says so", async ({ slack }) => {
  const [giver, recipient, another] = [await slack.member(), await slack.member(), await slack.member()];
  const message = await slack.post(giver, [mention(recipient), text(" "), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).length).toBe(1);

  await slack.edit(giver, message, [mention(recipient), text(" "), mention(another), text(" "), emoji("taco")]);

  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map((reply) => reply.text)).toEqual([
    `<@${recipient}> got 1 kudos from you. You have 2 kudos left today.`,
    "This message already gave kudos, so your edit doesn't change them. To give more, send a new message.",
  ]);
  expect(await slack.reactionsOn(message)).toEqual(["taco"]);
});

test("editing a thank-you over the allowance down to what's left swaps the hourglass for the kudos emoji", async ({ slack }) => {
  const [giver, first, second] = [await slack.member(), await slack.member(), await slack.member()];
  await slack.post(giver, [mention(first), text(" "), emoji("taco"), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).length).toBe(1);
  const tooMuch = await slack.post(giver, [mention(second), text(" "), emoji("taco"), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(tooMuch)).toEqual(["hourglass_flowing_sand"]);

  await slack.edit(giver, tooMuch, [mention(second), text(" "), emoji("taco")]);

  await expect.poll(() => slack.reactionsOn(tooMuch)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map((reply) => reply.text)).toEqual([
    `<@${first}> got 2 kudos from you. You have 1 kudos left today.`,
    "This needs 2 kudos (1 person × 2 kudos emoji), but you have 1 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again.",
    `<@${second}> got 1 kudos from you. That was your last kudos for today, and you'll have 3 more at midnight.`,
  ]);
});
