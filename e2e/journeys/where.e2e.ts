import { expect, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("a thank-you in a private channel counts like one in a public channel", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];

  const message = await slack.post(giver, [mention(recipient), text(" "), emoji("taco")], { channel: "G_E2E_PRIVATE", channelType: "group" });

  await expect.poll(() => slack.reactionsOn(message)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map((reply) => reply.text)).toEqual([`<@${recipient}> got 1 kudos from you. You have 2 kudos left today.`]);
});

test("direct messages, group DMs and bots' messages give no kudos", async ({ slack }) => {
  const [giver, recipient, sentinel] = [await slack.member(), await slack.member(), await slack.member()];
  const thanks = [mention(recipient), text(" "), emoji("taco")];

  const ignored = [
    await slack.post(giver, thanks, { channel: "D_E2E_DIRECT", channelType: "im" }),
    await slack.post(giver, thanks, { channel: "G_E2E_GROUP_DM", channelType: "mpim" }),
    await slack.post(giver, thanks, { fromBot: true }),
  ];
  // A thank-you that counts, sent after the others. Once its own reply has arrived, every reply the others could
  // have brought has too, so the whole list is read once rather than polled, which could pass on a passing moment.
  await slack.post(giver, [mention(sentinel), text(" "), emoji("taco")]);
  const replies = async () => (await slack.ephemeralsTo(giver)).map((reply) => String(reply.text));
  await expect.poll(async () => (await replies()).some((reply) => reply.startsWith(`<@${sentinel}>`))).toBe(true);

  expect(await replies()).toEqual([`<@${sentinel}> got 1 kudos from you. You have 2 kudos left today.`]);
  for (const message of ignored) expect(await slack.reactionsOn(message)).toEqual([]);
});
