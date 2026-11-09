import { expect, staysEqual, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("a member's first kudos welcomes the recipient and the giver, each once", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];
  const recipientWelcome = `<@${giver}> just thanked you with a kudos!`;
  const giverWelcome = "You just completed the first step of your onboarding journey.";
  const welcomes = async () => ({
    recipient: (await slack.dmsTo(recipient)).filter((dm) => dm.text === recipientWelcome).length,
    giver: (await slack.dmsTo(giver)).filter((dm) => dm.text === giverWelcome).length,
  });

  await slack.post(giver, [text("thanks "), mention(recipient), text(" "), emoji("taco")]);
  await expect.poll(welcomes).toEqual({ recipient: 1, giver: 1 });

  const again = await slack.post(giver, [text("and again "), mention(recipient), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(again)).toEqual(["taco"]);
  await staysEqual(welcomes, { recipient: 1, giver: 1 });
});
