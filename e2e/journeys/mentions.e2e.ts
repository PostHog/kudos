import { expect, staysEqual, test } from "../test.ts";
import { broadcast, emoji, groupMention, mention, text } from "../slack.ts";

const groupsSkipped = "`@here`, `@channel` and user groups don't receive kudos, so tag people individually";

test("mentions that can't receive kudos are skipped, each with its reason", async ({ slack }) => {
  const [giver, recipient, bot, gone] = [await slack.member(), await slack.member(), await slack.member({ is_bot: true }), await slack.member({ deleted: true })];

  const message = await slack.post(giver, [
    mention(recipient), text(" "), mention(giver), text(" "), mention(bot), text(" "), mention(gone), text(" "),
    broadcast("here"), text(" "), groupMention("S_E2E_TEAM"), text(" "), emoji("taco"),
  ]);

  await expect.poll(() => slack.reactionsOn(message)).toEqual(["taco"]);
  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map((reply) => reply.text)).toEqual([
    [
      `<@${recipient}> got 1 kudos from you. You have 2 kudos left today.`,
      `I skipped <@${giver}>: you can't give kudos to yourself.`,
      `I skipped <@${bot}>: bots don't receive kudos.`,
      `I skipped <@${gone}>: <@${gone}> isn't an active member of this workspace.`,
      `I skipped \`@here\` and <!subteam^S_E2E_TEAM>: ${groupsSkipped}.`,
    ].join("\n"),
  ]);
});

test("a thank-you where nobody can receive kudos gives nothing and says why", async ({ slack }) => {
  const giver = await slack.member();

  const message = await slack.post(giver, [mention(giver), text(" "), broadcast("channel"), text(" "), emoji("taco")]);

  await expect.poll(async () => (await slack.ephemeralsTo(giver)).map((reply) => reply.text)).toEqual([
    `Nobody in this message can receive kudos: you can't give kudos to yourself and ${groupsSkipped}. Tag a teammate and edit the message to try again.`,
  ]);
  await staysEqual(() => slack.reactionsOn(message), []);
});
