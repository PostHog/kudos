import { expect } from "./test.ts";
import { button, headerOf, textOf } from "./home.ts";
import type { Slack } from "./slack.ts";

// The workspace's settings, as an admin sees and changes them on App Home's Admin tab. They belong to the whole
// workspace, so a journey that changes them leaves them as it found them: public celebrations on, the Monday post off,
// and no announcement channel.

export const lastHome = async (slack: Slack, member: string) => (await slack.homesOf(member)).at(-1);

export const adminTabOf = async (slack: Slack, admin: string) => textOf((await lastHome(slack, admin))!);

export async function openAdminTab(slack: Slack, admin: string) {
  await slack.openHome(admin);
  await expect.poll(async () => (await lastHome(slack, admin)) !== undefined).toBe(true);
  await slack.click(admin, button((await lastHome(slack, admin))!, "Admin"));
  await expect.poll(async () => headerOf((await lastHome(slack, admin))!)).toBe("Admin");
}

// Runs `journey`, then puts the workspace's settings back, whether the journey passed or not. A failed journey's own
// error is the one reported, not a failure to put the settings back after it.
export async function leavingSettingsAsFound(slack: Slack, admin: string, journey: () => Promise<void>) {
  let failed = false;
  try {
    await journey();
  } catch (failure) {
    failed = true;
    throw failure;
  } finally {
    await restoreSettings(slack, admin).catch((failure: unknown) => {
      if (!failed) throw failure;
    });
  }
}

async function restoreSettings(slack: Slack, admin: string) {
  await openAdminTab(slack, admin);
  const tab = () => adminTabOf(slack, admin);
  const press = async (label: string, under?: string) => slack.click(admin, button((await lastHome(slack, admin))!, label, under));
  if ((await tab()).includes("I don't celebrate anyone's level ups")) {
    await press("Switch on", "I don't celebrate anyone's level ups");
    await expect.poll(tab).toContain("I celebrate teammates' level ups");
  }
  if ((await tab()).includes("Every Monday I post")) {
    await press("Switch off", "Every Monday I post");
    await expect.poll(tab).not.toContain("Every Monday I post");
  }
  const showsStopPosting = async () => {
    try {
      return button((await lastHome(slack, admin))!, "Stop posting") !== undefined;
    } catch {
      return false;
    }
  };
  if (await showsStopPosting()) {
    await press("Stop posting");
    await expect.poll(tab).toContain("I don't celebrate level ups in public yet.");
  }
}
