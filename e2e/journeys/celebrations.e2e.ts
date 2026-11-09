import { adminTabOf, lastHome, leavingSettingsAsFound, openAdminTab } from "../admin.ts";
import { button, channelPick } from "../home.ts";
import { expect, staysEqual, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("a level up is celebrated in the announcement channel while public celebrations are on, and not while they are off", async ({ slack }) => {
  const admin = await slack.member({ is_admin: true });
  const announcements = await slack.channel("public", { joined: true });
  const [first, second, ada, grace] = [await slack.member(), await slack.member(), await slack.member(), await slack.member()];
  // Level 2 takes 20 XP. A public celebration sits beside the message that earned it, so the kudos earns all 20 itself.
  const thanksToTwo = [text("thanks "), mention(ada), text(" and "), mention(grace), text(" "), emoji("taco")];
  // What the channel shows now, so a celebration that an update adds or takes away counts as members see it.
  const celebrated = async () => (await slack.messagesIn(announcements.id)).map((message) => message.text);
  const adminTab = () => adminTabOf(slack, admin);
  await leavingSettingsAsFound(slack, admin, async () => {
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
});
