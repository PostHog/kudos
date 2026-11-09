import { randomBytes } from "node:crypto";
import { button, headerOf, option, pickerOf } from "../home.ts";
import { expect, test } from "../test.ts";
import { emoji, mention, text, type Slack } from "../slack.ts";

const minuteMs = 60 * 1000;
const pickQuestion = "Which group do you count for on the leaderboard?";

const lastHome = async (slack: Slack, member: string) => (await slack.homesOf(member)).at(-1);

test("user groups sync from Slack, and a member's group pick on App Home puts them on that group's board", { tags: ["@time"] }, async ({ slack, time }) => {
  const [member, fernMate, oakMate, otherOakMate] = [await slack.member(), await slack.member(), await slack.member(), await slack.member()];
  const channel = await slack.channel();
  // Everyone meets the app before the sync, so the groups' members are its members.
  const welcome = await slack.post(fernMate, [mention(member), text(" "), mention(oakMate), text(" "), mention(otherOakMate), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(welcome)).toEqual(["taco"]);

  const tag = randomBytes(3).toString("hex");
  const [ferns, oaks] = [`Ferns ${tag}`, `Oaks ${tag}`];
  await slack.userGroup(ferns, [member, fernMate]);
  await slack.userGroup(oaks, [member, oakMate, otherOakMate]);
  const leaderboard = async () => {
    const [shown] = await slack.responsesTo(await slack.command(member, channel, "leaderboard"));
    return String(shown?.text);
  };
  // The app knows no group until it syncs, so the member sits on no group's board.
  expect(await leaderboard()).not.toContain(tag);

  // The sync lists the groups, then reads each group's members a few seconds apart.
  await time.runCron("slack.userGroups.syncUserGroups");
  await time.advance(minuteMs);
  await time.settle();

  // A member counts for the smallest of their groups until they pick another, and its board heads their leaderboard.
  expect((await leaderboard()).split("\n").slice(0, 2)).toEqual([`*${ferns}*`, "Give kudos this week to join the board."]);
  await slack.openHome(member);
  await expect.poll(async () => (await lastHome(slack, member)) !== undefined).toBe(true);
  await slack.click(member, button((await lastHome(slack, member))!, "Settings"));
  await expect.poll(async () => headerOf((await lastHome(slack, member))!)).toBe("Settings");
  expect(pickerOf((await lastHome(slack, member))!, pickQuestion)).toEqual({ options: [ferns, oaks], picked: ferns });

  await slack.click(member, option((await lastHome(slack, member))!, pickQuestion, oaks));
  await expect.poll(async () => pickerOf((await lastHome(slack, member))!, pickQuestion)?.picked).toBe(oaks);

  // From the pick on, their kudos count on the board of the group they picked.
  const thanks = await slack.post(member, [mention(oakMate), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(thanks)).toEqual(["taco"]);
  await expect.poll(leaderboard).toContain(`*${oaks}*\n🥇 <@${member}> · 1 kudos\n`);
  expect(await leaderboard()).not.toContain(ferns);
});
