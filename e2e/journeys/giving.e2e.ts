import { expect, staysEqual, test, receipt } from "../test.ts";
import { emoji, mention, text, type SlackCall } from "../slack.ts";

// Where a reply went, and its receipt.
const placed = (reply: SlackCall) => ({ channel: reply.channel, user: reply.user, ...(reply.thread_ts !== undefined && { thread_ts: reply.thread_ts }), text: receipt(reply) });

test("a thank-you with the kudos emoji marks the message and tells the giver privately what's left today", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];

  const message = await slack.post(giver, [text("thanks "), mention(recipient), text(" "), emoji("taco")]);

  await expect.poll(() => slack.reactionsOn(message)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map(placed)).toEqual([{ channel: message.channel, user: giver, text: `<@${recipient}> got 1 kudos from you · +10 XP\n2 kudos left today` }]);
});

test("the daily allowance runs out: the last kudos says so, and a thank-you beyond it waits under an hourglass", async ({ slack }) => {
  const [giver, first, second, third] = [await slack.member(), await slack.member(), await slack.member(), await slack.member()];

  await slack.post(giver, [mention(first), text(" "), mention(second), text(" "), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).length).toBe(1);
  await slack.post(giver, [mention(third), text(" "), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).length).toBe(2);
  const tooMuch = await slack.post(giver, [mention(first), text(" "), emoji("taco")]);

  await expect.poll(() => slack.reactionsOn(tooMuch)).toEqual(["hourglass_flowing_sand"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map(receipt)).toEqual([
    `<@${first}> and <@${second}> got 1 kudos from you · +20 XP\n1 kudos left today`,
    `<@${third}> got 1 kudos from you · +10 XP\nThat was your last kudos for today, and you'll have 3 more at midnight.`,
    "This needs 1 kudos (1 person × 1 kudos emoji), but you have 0 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again.",
  ]);
});

test("a repeated kudos emoji gives each person that many kudos", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];

  const message = await slack.post(giver, [mention(recipient), text(" "), emoji("taco"), emoji("taco")]);

  await expect.poll(() => slack.reactionsOn(message)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map(receipt)).toEqual([`<@${recipient}> got 2 kudos from you · +20 XP\n1 kudos left today`]);
});

test("a thank-you in a thread marks the reply and answers the giver in that thread", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];
  const root = await slack.post(recipient, [text("shipped it")]);

  const reply = await slack.post(giver, [text("nice one "), mention(recipient), text(" "), emoji("taco")], { threadTs: root.ts });

  await expect.poll(() => slack.reactionsOn(reply)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map(placed)).toEqual([
    { channel: reply.channel, user: giver, text: `<@${recipient}> got 1 kudos from you · +10 XP\n2 kudos left today`, thread_ts: root.ts },
  ]);
  expect(await slack.reactionsOn(root)).toEqual([]);
});

test("an event Slack delivers twice gives its kudos once", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];
  const replies = async () => (await slack.ephemeralsTo(giver)).map(receipt);
  // A first thank-you, so the app knows both members and a second give would land within a second.
  await slack.post(giver, [mention(recipient), text(" "), emoji("taco")]);
  await expect.poll(async () => (await replies()).length).toBe(1);

  await slack.post(giver, [mention(recipient), text(" "), emoji("taco")]);
  await slack.redeliverLast();

  await expect.poll(async () => (await replies()).length).toBeGreaterThanOrEqual(2);
  await staysEqual(replies, [
    `<@${recipient}> got 1 kudos from you · +10 XP\n2 kudos left today`,
    `<@${recipient}> got 1 kudos from you · +10 XP\n1 kudos left today`,
  ]);
});

test("when Slack rate-limits the mark, it lands once Slack lets it", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];
  const { id: channel } = await slack.channel();
  await slack.rateLimitNext("reactions.add", channel, 1);

  const message = await slack.post(giver, [mention(recipient), text(" "), emoji("taco")], { channel });

  await expect.poll(() => slack.reactionsOn(message)).toEqual(["taco"]);
  // Slack asked for a second's wait, and the mark that landed came no sooner.
  const [refused, ...after] = await slack.callTimes("reactions.add", channel);
  expect(after.length).toBeGreaterThan(0);
  expect(Math.min(...after) - refused!).toBeGreaterThanOrEqual(1_000);
});
