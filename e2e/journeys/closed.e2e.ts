import { expect, test } from "../test.ts";

// The website flag is on in production's flags; this journey switches it off for the whole app and on again, so it
// leaves the app as it found it even when it fails.
test("while the website is closed nobody signs in, and a member already signed in reads it closed", async ({ slack, website }) => {
  const member = await slack.member();
  await website.signIn(member, { path: "/leaderboard" });
  await expect(website.screen.getByRole("link", { name: `Your profile, Member ${member}` })).toBeVisible();

  try {
    await website.switchFlag("website", false);

    await expect(website.heading()).toHaveText("Not open yet");
    await website.app.clearState();
    await website.app.open("/leaderboard");
    await expect(website.heading()).toHaveText("Not open yet");
    await expect(website.screen.getByRole("button", { name: "Sign in with Slack" })).toHaveCount(0);
  } finally {
    await website.switchFlag("website", true);
  }
  await expect(website.screen.getByRole("button", { name: "Sign in with Slack" })).toBeVisible();
});
