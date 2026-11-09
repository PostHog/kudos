import { adminTabOf, lastHome, leavingSettingsAsFound, openAdminTab } from "../admin.ts";
import { button, channelPick } from "../home.ts";
import { expect, test } from "../test.ts";

test("an admin picks the announcement channel, and switches public celebrations and the Monday post", async ({ slack }) => {
  const admin = await slack.member({ is_admin: true });
  const channel = await slack.channel("public", { joined: true });
  // The Monday post ranks groups or quotes kudos, so App Home offers it only once the workspace has a user group.
  await slack.createdUserGroup(`Group ${admin}`, [admin]);
  const adminTab = () => adminTabOf(slack, admin);
  await leavingSettingsAsFound(slack, admin, async () => {
    await openAdminTab(slack, admin);
    expect(await adminTab()).toContain("I don't celebrate level ups in public yet. Pick a channel to celebrate them there.");

    await slack.click(admin, channelPick((await lastHome(slack, admin))!, "celebrate level ups in", channel.id));

    await expect.poll(adminTab).toContain("I celebrate level ups in this channel.");
    expect(await adminTab()).toContain("I celebrate teammates' level ups in the announcement channel.");
    // The group syncs a moment after Slack announces it, so the Admin tab is opened again until it offers the Monday post.
    await expect
      .poll(async () => {
        await openAdminTab(slack, admin);
        return adminTab();
      })
      .toContain(`I can post last week's top kudos in <#${channel.id}> every Monday at 9:00.`);

    await slack.click(admin, button((await lastHome(slack, admin))!, "Switch on", "every Monday at 9:00"));
    await expect.poll(adminTab).toContain(`Every Monday I post last week's top kudos in <#${channel.id}>.`);
    await slack.click(admin, button((await lastHome(slack, admin))!, "Switch off", "Every Monday I post"));
    await expect.poll(adminTab).toContain(`I can post last week's top kudos in <#${channel.id}> every Monday at 9:00.`);

    await slack.click(admin, button((await lastHome(slack, admin))!, "Switch off", "I celebrate teammates' level ups"));
    await expect.poll(adminTab).toContain("I don't celebrate anyone's level ups in public. Each teammate still hears about their own.");
    await slack.click(admin, button((await lastHome(slack, admin))!, "Switch on", "I don't celebrate anyone's level ups"));
    await expect.poll(adminTab).toContain("I celebrate teammates' level ups in the announcement channel.");

    await slack.click(admin, button((await lastHome(slack, admin))!, "Stop posting"));
    await expect.poll(adminTab).toContain("I don't celebrate level ups in public yet. Pick a channel to celebrate them there.");
    expect(await adminTab()).not.toContain("Monday post");
  });
});
