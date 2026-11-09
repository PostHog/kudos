import { expect, test } from "../test.ts";

const joined = "I'm in now. Mention teammates with a kudos emoji here and I'll pass the kudos on.";
const alreadyIn = "I'm already in this channel. Mention teammates with a kudos emoji to give kudos.";
const staysOut = "I stay out of customer channels and channels shared with another organization, since I quote kudos.";

test("/hedgehug in a channel joins it, and says so when it is already in", async ({ slack }) => {
  const [member, channel] = [await slack.member(), await slack.channel()];

  const first = await slack.command(member, channel);
  await expect.poll(() => slack.responsesTo(first)).toEqual([{ response_type: "ephemeral", text: joined }]);
  expect(await slack.hasJoined(channel.id)).toBe(true);
  const again = await slack.command(member, channel);

  await expect.poll(() => slack.responsesTo(again)).toEqual([{ response_type: "ephemeral", text: alreadyIn }]);
});

test("/hedgehug can't join a private channel by itself and says how to invite it", async ({ slack }) => {
  const [member, channel] = [await slack.member(), await slack.channel("private")];

  const reply = await slack.command(member, channel);

  await expect.poll(() => slack.responsesTo(reply)).toEqual([
    { response_type: "ephemeral", text: "I can't join private channels by myself. Type `/invite @HedgeHug` here and I'll start counting kudos." },
  ]);
});

test("/hedgehug stays out of shared and customer channels", async ({ slack }) => {
  const member = await slack.member();
  const shared = await slack.channel("shared");
  const customer = await slack.channel("public", { name: "customer-e2e" });

  const replies = [await slack.command(member, shared), await slack.command(member, customer)];

  for (const reply of replies) await expect.poll(() => slack.responsesTo(reply)).toEqual([{ response_type: "ephemeral", text: staysOut }]);
  expect([await slack.hasJoined(shared.id), await slack.hasJoined(customer.id)]).toEqual([false, false]);
});

test("/hedgehug in a direct message says to run it in a channel", async ({ slack }) => {
  const [member, direct] = [await slack.member(), await slack.directMessage()];

  const reply = await slack.command(member, direct);

  await expect.poll(() => slack.responsesTo(reply)).toEqual([
    { response_type: "ephemeral", text: "I only count kudos in channels. Run `/hedgehug` in the channel you want me in." },
  ]);
});
