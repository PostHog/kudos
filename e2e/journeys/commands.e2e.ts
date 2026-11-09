import { expect, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

const texts = (shown: Record<string, unknown>[]) => shown.map((reply) => ({ response_type: reply.response_type, text: reply.text }));

test("/hedgehug @someone shows their profile card, privately", async ({ slack }) => {
  const [giver, recipient] = [await slack.member(), await slack.member()];
  const channel = await slack.channel();
  const message = await slack.post(giver, [text("thanks "), mention(recipient), text(" "), emoji("taco")]);
  await expect.poll(() => slack.reactionsOn(message)).toEqual(["taco"]);

  const reply = await slack.command(giver, channel, `<@${recipient}>`);

  await expect.poll(async () => texts(await slack.responsesTo(reply))).toEqual([{ response_type: "ephemeral", text: expect.stringMatching(new RegExp(`^\\*<@${recipient}>\\*\\nLevel 1`)) }]);
});

test("/hedgehug @someone the app hasn't met yet looks them up, then shows their card", async ({ slack }) => {
  const [asker, stranger] = [await slack.member(), await slack.member()];

  const reply = await slack.command(asker, await slack.channel(), `<@${stranger}|stranger>`);

  await expect.poll(async () => texts(await slack.responsesTo(reply))).toEqual([{ response_type: "ephemeral", text: expect.stringMatching(new RegExp(`^\\*<@${stranger}>\\*\\nLevel 1`)) }]);
});

test("/hedgehug @someone says why when they can't have a card, and how to ask when the text isn't one person", async ({ slack }) => {
  const [asker, bot] = [await slack.member(), await slack.member({ is_bot: true })];
  const channel = await slack.channel();

  const forBot = await slack.command(asker, channel, `<@${bot}>`);
  const forEveryone = await slack.command(asker, channel, "<!here>");

  await expect.poll(async () => texts(await slack.responsesTo(forBot))).toEqual([{ response_type: "ephemeral", text: `<@${bot}> isn't an active member of this workspace.` }]);
  expect(texts(await slack.responsesTo(forEveryone))).toEqual([{ response_type: "ephemeral", text: "Type `/hedgehug @someone` to see their profile card." }]);
});

test("/hedgehug leaderboard with a period it doesn't know shows how to ask", async ({ slack }) => {
  const asker = await slack.member();

  const reply = await slack.command(asker, await slack.channel(), "leaderboard yesterday");

  await expect.poll(async () => texts(await slack.responsesTo(reply))).toEqual([
    { response_type: "ephemeral", text: "Try `/hedgehug leaderboard`, `/hedgehug leaderboard month` or `/hedgehug leaderboard all`." },
  ]);
});
