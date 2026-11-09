import { expect, receipt, staysEqual, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("a kudos earns XP in the reply, and crossing a level brings the level-up message", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];
  const levelUps = async () => (await slack.dmsTo(giver)).map((dm) => String(dm.text).split("\n")[0] ?? "").filter((line) => line.includes("You reached level"));

  await slack.post(giver, [text("thanks "), mention(recipient), text(" "), emoji("taco")]);

  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map(receipt)).toEqual([`<@${recipient}> got 1 kudos from you · +10 XP\n2 kudos left today`]);
  await expect.poll(levelUps).toEqual(["🎉 You reached level 2!"]);
  await staysEqual(levelUps, ["🎉 You reached level 2!"]);
});
