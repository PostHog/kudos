import { expect, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("after kudos in Slack, the member's activity, leaderboard and profile show their own kudos", async ({ slack, website }) => {
  const [member, friend] = [await slack.member(), await slack.member()];
  // One give at a time, each marked before the next, as two people would.
  const given = await slack.post(member, [text("thanks for the review "), mention(friend), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(given)).toEqual(["taco"]);
  const received = await slack.post(friend, [text("and you for the fix "), mention(member), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(received)).toEqual(["taco"]);

  await website.signIn(member, { path: "/activity" });

  await website.pastTheMoments();
  const thankedMe = website.screen.getByRole("region", { name: "Who thanked you this week" });
  await expect(thankedMe).toContainText(`Member ${friend} gave you a kudos`);
  await expect(thankedMe).toContainText(`and you for the fix @Member ${member}`);

  await website.open("/leaderboard");
  const myWeek = website.screen.getByRole("region", { name: "You this week" });
  await expect(myWeek).toContainText(`Member ${member}`);
  await expect(myWeek).toContainText("1 teammate thanked you this week");
  await expect(myWeek).toContainText("Your thanks have reached 1 teammate");

  await website.open("/");
  await expect(website.screen.getByRole("region", { name: "Your card" }).getByRole("heading")).toHaveText(`Member ${member}`);
  const thisWeek = website.screen.getByRole("region", { name: "This week" });
  await expect(thisWeek).toContainText(/\b1\s*you thanked/);
  await expect(thisWeek).toContainText(/\b1\s*thanked you/);
  await expect(thisWeek.getByRole("list", { name: "Latest kudos" })).toContainText(`thanks for the review @Member ${friend}`);
});
