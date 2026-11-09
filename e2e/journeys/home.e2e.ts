import { button, chosen, headerOf, option, tabsOf } from "../home.ts";
import { expect, isBoard, receipt, staysEqual, test } from "../test.ts";
import { emoji, mention, text, type Slack } from "../slack.ts";

// The hugs a member may give a day, where the workspace sets no other number.
const hugBudget = 10;

const lastHome = async (slack: Slack, member: string) => (await slack.homesOf(member)).at(-1);

test("opening App Home publishes it with the member's tabs, and an admin's has the Admin tab too", async ({ slack }) => {
  const [member, admin] = [await slack.member(), await slack.member({ is_admin: true })];

  await slack.openHome(member);
  await slack.openHome(admin);

  await expect.poll(async () => tabsOf((await lastHome(slack, member))!)).toEqual(["Profile", "Settings"]);
  await expect.poll(async () => tabsOf((await lastHome(slack, admin))!)).toEqual(["Profile", "Settings", "Admin"]);
  expect(headerOf((await lastHome(slack, member))!)).toBe("Your kudos");
});

test("App Home's tabs and the leaderboard switch publish it again, and the switch takes the member off every board", async ({ slack }) => {
  const [member, author, onlooker] = [await slack.member(), await slack.member(), await slack.member()];
  const channel = await slack.channel();
  // A day's whole hug budget puts the member at the top of the hugs board everyone sees, whatever other journeys gave.
  for (let win = 1; win <= hugBudget; win++) await slack.react(member, await slack.post(author, [text(`win ${win}`)]), "taco");
  await slack.askUntil(onlooker, channel, "leaderboard", (answer) => answer.includes(`<@${member}> · ${hugBudget} hugs`));
  await slack.openHome(member);
  await expect.poll(async () => (await lastHome(slack, member)) !== undefined).toBe(true);

  await slack.click(member, button((await lastHome(slack, member))!, "Settings"));
  await expect.poll(async () => headerOf((await lastHome(slack, member))!)).toBe("Settings");
  await slack.click(member, button((await lastHome(slack, member))!, "Off", "Show me on the leaderboards"));

  await slack.askUntil(member, channel, "leaderboard", (answer) => answer.includes("You're not on the leaderboards."));
  await slack.askUntil(onlooker, channel, "leaderboard", (answer) => isBoard(answer) && !answer.includes(`<@${member}>`));
});

test("the reply to a kudos goes where the member's message settings put it", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];
  const replies = async () => ({ inChannel: (await slack.ephemeralsTo(giver)).map(receipt), asDm: (await slack.dmsTo(giver)).filter((dm) => String(dm.text).includes("kudos from you")).map(receipt) });
  await slack.openHome(giver);
  await expect.poll(async () => (await lastHome(slack, giver)) !== undefined).toBe(true);
  await slack.click(giver, button((await lastHome(slack, giver))!, "Settings"));
  await expect.poll(async () => headerOf((await lastHome(slack, giver))!)).toBe("Settings");

  await slack.click(giver, option((await lastHome(slack, giver))!, "After-kudos reply", "As a DM"));
  await expect.poll(async () => chosen((await lastHome(slack, giver))!, "After-kudos reply")).toBe("As a DM");
  await slack.post(giver, [text("thanks "), mention(recipient), text(" "), emoji("taco")]);
  await expect.poll(replies).toEqual({ inChannel: [], asDm: [`<@${recipient}> got 1 kudos from you · +10 XP\n2 kudos left today`] });

  await slack.click(giver, option((await lastHome(slack, giver))!, "After-kudos reply", "None"));
  await expect.poll(async () => chosen((await lastHome(slack, giver))!, "After-kudos reply")).toBe("None");
  const quiet = await slack.post(giver, [text("and again "), mention(recipient), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(quiet)).toEqual(["taco"]);
  await staysEqual(replies, { inChannel: [], asDm: [`<@${recipient}> got 1 kudos from you · +10 XP\n2 kudos left today`] });
});
