import { expect, staysEqual, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("a deleted kudos message leaves the member's activity and the kudos of the week, and HedgeHug calls Slack for nothing", async ({ slack, website }) => {
  const [member, friend] = [await slack.member(), await slack.member()];
  // A channel of the journey's own, so every call the app makes in it is about this journey's message.
  const channel = await slack.channel("public", { joined: true });
  const thanks = await slack.post(friend, [text("thanks for the pairing "), mention(member), text(" "), emoji("taco")], { channel: channel.id });
  await expect.poll(() => slack.reactionsOn(thanks)).toEqual(["taco"]);

  // The member's only kudos this week is their kudos of the week.
  await website.signIn(member, { path: "/" });
  await website.pastTheMoments();
  const kudosOfTheWeek = website.screen.getByRole("figure", { name: "Kudos of the week" });
  await expect(kudosOfTheWeek).toContainText("thanks for the pairing");
  await website.open("/activity");
  const thankedMe = website.screen.getByRole("region", { name: "Who thanked you this week" });
  await expect(thankedMe).toContainText("thanks for the pairing");
  const callsBefore = await slack.callsIn(channel.id);

  await slack.remove(thanks);

  await expect(thankedMe).not.toContainText("thanks for the pairing");
  await website.open("/");
  const thisWeek = website.screen.getByRole("region", { name: "This week" });
  await expect(thisWeek).toContainText("thanked you");
  await expect(thisWeek).not.toContainText("thanks for the pairing");
  await expect(website.screen.getByRole("figure", { name: "Kudos of the week" })).toHaveCount(0);
  await staysEqual(() => slack.callsIn(channel.id), callsBefore);
});
