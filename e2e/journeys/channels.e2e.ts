import { expect, staysEqual, test } from "../test.ts";

test("a new public channel is joined, and one named for a customer or for sharing is not", async ({ slack }) => {
  const created = await slack.createChannel();
  const forCustomer = await slack.createChannel({ name: `customer-e2e-${Date.now()}` });
  const toBeShared = await slack.createChannel({ name: `ext-e2e-${Date.now()}` });

  await expect.poll(() => slack.hasJoined(created.id)).toBe(true);
  const joins = async () => (await slack.callsTo("conversations.join")).filter((call) => call.channel === forCustomer.id || call.channel === toBeShared.id);
  await staysEqual(joins, []);
  expect([await slack.hasJoined(forCustomer.id), await slack.hasJoined(toBeShared.id)]).toEqual([false, false]);
});

test("a channel that becomes shared with another organization is left", async ({ slack }) => {
  const channel = await slack.createChannel();
  await expect.poll(() => slack.hasJoined(channel.id)).toBe(true);

  await slack.shareChannel(channel);

  await expect.poll(() => slack.hasJoined(channel.id)).toBe(false);
});

test("a channel renamed as a customer channel is left, and one renamed otherwise is kept", async ({ slack }) => {
  const [toCustomer, renamed] = [await slack.createChannel(), await slack.createChannel()];
  await expect.poll(async () => [await slack.hasJoined(toCustomer.id), await slack.hasJoined(renamed.id)]).toEqual([true, true]);

  await slack.renameChannel(toCustomer, `customer-e2e-${Date.now()}`);
  await slack.renameChannel(renamed, `e2e-renamed-${Date.now()}`);

  await expect.poll(() => slack.hasJoined(toCustomer.id)).toBe(false);
  await staysEqual(() => slack.hasJoined(renamed.id), true);
});
