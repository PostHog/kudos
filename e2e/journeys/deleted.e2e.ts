import { expect, staysEqual, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("a deleted kudos message leaves the member's activity and the kudos of the week, and HedgeHug calls Slack for nothing", async ({ slack, website }) => {
  const [member, friend] = [await slack.member(), await slack.member()];
  const thanks = await slack.post(friend, [text("thanks for the pairing "), mention(member), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(thanks)).toEqual(["taco"]);
  await website.signIn(member, { path: "/activity" });
  await website.pastTheMoments();
  const thankedMe = website.screen.getByRole("region", { name: "Who thanked you this week" });
  await expect(thankedMe).toContainText("thanks for the pairing");
  const callsBefore = await slack.callsAbout(thanks);

  await slack.remove(thanks);

  await expect(thankedMe).not.toContainText("thanks for the pairing");
  await website.open("/");
  const thisWeek = website.screen.getByRole("region", { name: "This week" });
  await expect(thisWeek).toContainText("thanked you");
  await expect(thisWeek).not.toContainText("thanks for the pairing");
  await staysEqual(() => slack.callsAbout(thanks), callsBefore);
});
