import { expect, staysEqual, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("a thank-you in a private channel counts like one in a public channel", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];

  const message = await slack.post(giver, [mention(recipient), text(" "), emoji("taco")], { channel: "G_E2E_PRIVATE", channelType: "group" });

  await expect.poll(() => slack.reactionsOn(message)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map((reply) => reply.text)).toEqual([`<@${recipient}> got 1 kudos from you. You have 2 kudos left today.`]);
});

test("direct messages, group DMs and bots' messages give no kudos", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];
  const thanks = [mention(recipient), text(" "), emoji("taco")];
  const replies = async () => (await slack.ephemeralsTo(giver)).map((reply) => String(reply.text));
  // A thank-you that counts, first, so the app knows both members: a wrong give below then lands within a second,
  // rather than after a directory lookup that can be retried a minute later.
  await slack.post(giver, thanks);
  await expect.poll(async () => (await replies()).length).toBe(1);

  const ignored = [
    await slack.post(giver, thanks, { channel: "D_E2E_DIRECT", channelType: "im" }),
    await slack.post(giver, thanks, { channel: "G_E2E_GROUP_DM", channelType: "mpim" }),
    await slack.post(giver, thanks, { fromBot: true }),
  ];
  await slack.post(giver, thanks);
  await expect.poll(async () => (await replies()).length).toBeGreaterThanOrEqual(2);

  const marks = async () => Promise.all(ignored.map((message) => slack.reactionsOn(message)));
  await staysEqual(async () => ({ replies: await replies(), marks: await marks() }), {
    replies: [`<@${recipient}> got 1 kudos from you. You have 2 kudos left today.`, `<@${recipient}> got 1 kudos from you. You have 1 kudos left today.`],
    marks: [[], [], []],
  });
});
