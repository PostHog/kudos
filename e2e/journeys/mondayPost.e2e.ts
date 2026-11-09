import { button, channelPick, option, textOf } from "../home.ts";
import { expect, test } from "../test.ts";
import { emoji, mention, text, type Slack } from "../slack.ts";
import { untilNext } from "../time.ts";

// Each clock step may take the seam's 25 s budget, and this journey takes several, so it outlasts the suite's minute.
const clockedJourneyMs = 180_000;

const dayMs = 24 * 60 * 60 * 1000;
const minuteMs = 60 * 1000;

const lastHome = async (slack: Slack, member: string) => (await slack.homesOf(member)).at(-1);

test("the Monday post names last week's most-hugged kudos in the announcement channel at 9:00 on Monday", { tags: ["@time"], timeout: clockedJourneyMs }, async ({ slack, time }) => {
  const admin = await slack.member({ is_admin: true });
  const announcements = await slack.channel();
  const adminText = async () => textOf((await lastHome(slack, admin))!);
  // The Monday post ranks teams too, so its switch waits for the workspace to have one.
  await slack.userGroup(`Team ${admin}`, [admin]);
  await time.runCron("slack.userGroups.syncUserGroups");

  // An admin picks the announcement channel on App Home's Admin tab, switches the Monday post on, and posts it by UTC.
  await slack.openHome(admin);
  await expect.poll(async () => (await lastHome(slack, admin)) !== undefined).toBe(true);
  await slack.click(admin, button((await lastHome(slack, admin))!, "Admin"));
  await expect.poll(adminText).toContain("in public");
  await slack.click(admin, channelPick((await lastHome(slack, admin))!, "celebrate", announcements.id));
  await expect.poll(adminText).toMatch(new RegExp(`(I can post|Every Monday I post) last week's top kudos in <#${announcements.id}>`));
  if ((await adminText()).includes("I can post")) await slack.click(admin, button((await lastHome(slack, admin))!, "Switch on", "I can post"));
  await expect.poll(adminText).toContain(`Every Monday I post last week's top kudos in <#${announcements.id}>.`);
  await slack.click(admin, option((await lastHome(slack, admin))!, "I post it at 9:00 in this time zone.", "UTC"));
  await time.settle();

  // Two kudos this week: the one teammates hugged most is the one the post quotes.
  const talk = await slack.channel();
  const [giver, first, second, other] = [await slack.member(), await slack.member(), await slack.member(), await slack.member()];
  const huggers = [await slack.member(), await slack.member(), await slack.member()];
  const top = await slack.post(giver, [text("thanks for the launch plan "), mention(first), text(" and "), mention(second), text(" "), emoji("taco")], { channel: talk.id });
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).length).toBe(1);
  await slack.post(other, [text("thanks for the coffee "), mention(giver), text(" "), emoji("taco")], { channel: talk.id });
  await expect.poll(async () => (await slack.ephemeralsTo(other)).length).toBe(1);
  for (const hugger of huggers) await slack.react(hugger, top, "taco");
  await time.settle();

  // Monday 9:00 UTC, the first one after the kudos' week began.
  const now = await time.now();
  const mondayMorning = new Date(now).getUTCDay() === 1 && new Date(now).getUTCHours() < 9;
  const untilNine = untilNext(now, 1, 9) + (mondayMorning ? 7 * dayMs : 0);
  const posts = async () => (await slack.messagesIn(announcements.id)).filter((message) => message.text.startsWith("🏆 Last week's top kudos"));
  await time.advance(untilNine - 2 * minuteMs);
  await time.settle();
  expect(await posts()).toEqual([]);
  await time.advance(2 * minuteMs);
  await time.settle();

  await expect.poll(async () => (await posts()).length).toBe(1);
  const [post] = await posts();
  const [headline, quoted] = post!.text.split("\n");
  expect(headline).toBe("🏆 Last week's top kudos");
  expect(quoted).toMatch(new RegExp(`^Member ${giver} thanked Member ${first} and Member ${second}: thanks for the launch plan `));
  expect(post!.text).not.toContain("thanks for the coffee");
});
