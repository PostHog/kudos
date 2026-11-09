import { button, channelPick, headerOf, textOf } from "../home.ts";
import { expect, staysEqual, test } from "../test.ts";
import { emoji, mention, text, type Slack } from "../slack.ts";

const lastHome = async (slack: Slack, member: string) => (await slack.homesOf(member)).at(-1);

async function openAdminTab(slack: Slack, admin: string) {
  await slack.openHome(admin);
  await expect.poll(async () => (await lastHome(slack, admin)) !== undefined).toBe(true);
  await slack.click(admin, button((await lastHome(slack, admin))!, "Admin"));
  await expect.poll(async () => headerOf((await lastHome(slack, admin))!)).toBe("Admin");
}

// The announcement channel and the switch belong to the whole workspace, so the journey leaves them as it found them.
test("a level up is celebrated in the announcement channel while public celebrations are on, and not while they are off", async ({ slack }) => {
  const admin = await slack.member({ is_admin: true });
  const announcements = await slack.channel("public", { joined: true });
  const [first, second, ada, grace] = [await slack.member(), await slack.member(), await slack.member(), await slack.member()];
  // Level 2 takes 20 XP. A public celebration sits beside the message that earned it, so the kudos earns all 20 itself.
  const thanksToTwo = [text("thanks "), mention(ada), text(" and "), mention(grace), text(" "), emoji("taco")];
  const celebrated = async () => (await slack.postsIn(announcements.id)).map((post) => String(post.text));
  const adminTab = async () => textOf((await lastHome(slack, admin))!);
  await openAdminTab(slack, admin);
  await slack.click(admin, channelPick((await lastHome(slack, admin))!, "celebrate level ups in", announcements.id));
  await expect.poll(adminTab).toContain("I celebrate teammates' level ups in the announcement channel.");

  await slack.post(first, thanksToTwo);

  await expect.poll(celebrated).toContain(`🎉 <@${first}> reached level 2.`);

  await slack.click(admin, button((await lastHome(slack, admin))!, "Switch off", "I celebrate teammates' level ups"));
  await expect.poll(adminTab).toContain("I don't celebrate anyone's level ups in public.");
  await slack.post(second, thanksToTwo);
  await expect.poll(async () => (await slack.dmsTo(second)).some((dm) => String(dm.text).includes("You reached level 2"))).toBe(true);
  await staysEqual(async () => (await celebrated()).some((post) => post.includes(`<@${second}>`)), false);

  await slack.click(admin, button((await lastHome(slack, admin))!, "Switch on", "I don't celebrate anyone's level ups"));
  await expect.poll(adminTab).toContain("I celebrate teammates' level ups in the announcement channel.");
  await slack.click(admin, button((await lastHome(slack, admin))!, "Stop posting"));
  await expect.poll(adminTab).toContain("I don't celebrate level ups in public yet.");
});
