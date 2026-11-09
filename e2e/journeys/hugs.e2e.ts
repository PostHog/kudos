import { expect, staysEqual, test } from "../test.ts";
import { text } from "../slack.ts";

test("a hug reaction counts once on every board, and a member's first hug is explained", async ({ slack }) => {
  const [hugger, author] = [await slack.member(), await slack.member()];
  const channel = await slack.channel();
  const message = await slack.post(author, [text("shipped the release")]);
  const boards = async () => Promise.all(["leaderboard", "leaderboard month", "leaderboard all"].map(async (period) => (await slack.ask(hugger, channel, period)).includes(`<@${hugger}> · 1 hug`)));

  await slack.react(hugger, message, "taco");

  await expect.poll(async () => (await slack.dmsTo(hugger)).map((dm) => dm.text)).toContain("Nice, that was your first hug!");
  // The author hears of it too. "hugged your message" links to the message once the app knows the workspace's address.
  const nudge = new RegExp(`^<@${hugger}> (<[^|>]+\\|hugged your message>|hugged your message) :taco:$`, "m");
  await expect.poll(async () => (await slack.dmsTo(author)).some((dm) => nudge.test(String(dm.text)))).toBe(true);
  await expect.poll(boards).toEqual([true, true, true]);

  await slack.react(hugger, message, "taco");
  await staysEqual(boards, [true, true, true]);
});

test("a reaction to your own message is no hug", async ({ slack }) => {
  const [member, other] = [await slack.member(), await slack.member()];
  const channel = await slack.channel();
  const own = await slack.post(member, [text("my own news")]);
  const theirs = await slack.post(other, [text("their news")]);
  const board = () => slack.ask(member, channel, "leaderboard");

  // The hug that counts lands first, so the count can only grow from here if the own-message reaction counts too.
  await slack.react(member, theirs, "taco");
  await expect.poll(async () => (await slack.dmsTo(member)).filter((dm) => dm.text === "Nice, that was your first hug!").length).toBe(1);
  await expect.poll(board).toContain(`<@${member}> · 1 hug`);

  await slack.react(member, own, "taco");
  await staysEqual(async () => (await board()).includes(`<@${member}> · 1 hug`), true);
});
