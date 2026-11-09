import { expect, test } from "../test.ts";
import { emoji, mention, text, type Slack } from "../slack.ts";

const shown = async (slack: Slack, member: string, channel: { id: string; name: string }) => {
  const [answer] = await slack.responsesTo(await slack.command(member, channel, "leaderboard"));
  return String(answer?.text);
};

test("switching the leaderboards off on the website takes the member off them in Slack", async ({ slack, website }) => {
  const [member, friend] = [await slack.member(), await slack.member()];
  const channel = await slack.channel();
  const thanks = await slack.post(friend, [mention(member), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(thanks)).toEqual(["taco"]);
  await expect.poll(() => shown(slack, member, channel)).not.toContain("You're not on the leaderboards.");

  await website.signIn(member, { path: "/settings" });
  await website.pastTheMoments();
  const onTheBoards = website.screen.getByRole("switch", { name: "Show me on the leaderboards" });
  await expect(onTheBoards).toBeChecked();
  await onTheBoards.click();
  await expect(onTheBoards).toBeChecked({ checked: false });

  await expect.poll(() => shown(slack, member, channel)).toContain("You're not on the leaderboards.");
  await website.open("/settings");
  await expect(website.screen.getByRole("switch", { name: "Show me on the leaderboards" })).toBeChecked({ checked: false });
});

test("a reply setting changed on the website moves the next kudos reply in Slack", async ({ slack, website }) => {
  const [member, friend] = [await slack.member(), await slack.member()];
  await website.signIn(member, { path: "/settings" });
  await website.pastTheMoments();
  const replies = website.screen.getByRole("radiogroup", { name: "Where I send you After-kudos reply" });
  await expect(replies.getByRole("radio", { name: "In the channel" })).toBeChecked();

  // The page's sticky header can cover the option, so the member picks it from the keyboard.
  await replies.getByRole("radio", { name: "As a DM" }).press("Space");
  await expect(replies.getByRole("radio", { name: "As a DM" })).toBeChecked();
  // The page shows a pick at once; a fresh load shows it stored.
  await website.open("/settings");
  await expect(website.screen.getByRole("radiogroup", { name: "Where I send you After-kudos reply" }).getByRole("radio", { name: "As a DM" })).toBeChecked();
  await slack.post(member, [text("thanks "), mention(friend), text(" "), emoji("taco")]);

  await expect.poll(async () => (await slack.dmsTo(member)).filter((dm) => String(dm.text).includes("kudos from you")).length).toBe(1);
  expect(await slack.ephemeralsTo(member)).toEqual([]);
});
