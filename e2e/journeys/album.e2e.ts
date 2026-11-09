import { expect, test } from "../test.ts";
import { emoji, mention, text, type SlackCall } from "../slack.ts";

type Blocks = Array<{ type: string; elements?: Array<{ type: string; text?: { text: string }; url?: string }> }>;

// What the reply says the giver brought into their album, and its first button: its label, and the website page it opens.
function albumPartOf(reply: SlackCall) {
  const items = String(reply.text).split("\n").filter((line) => line.startsWith("🎁"));
  const [first] = ((reply.blocks ?? []) as Blocks).filter((block) => block.type === "actions").flatMap((block) => block.elements ?? []);
  return { items, button: first?.text?.text, opens: first?.url === undefined ? undefined : new URL(first.url).pathname };
}

// The member's welcome item may wait beside the ones their kudos bring, so the button says "it" or "them".
const identify = expect.stringMatching(/^Identify (it|them) on the website$/);

test("each kudos brings the giver an item for their album, one per teammate a week, to identify on the website", async ({ slack }) => {
  const giver = await slack.member();
  const [ada, grace] = [await slack.member({ real_name: "Ada Example" }), await slack.member({ real_name: "Grace Example" })];
  const replies = async () => (await slack.ephemeralsTo(giver)).map(albumPartOf);

  await slack.post(giver, [text("thanks for the review "), mention(ada), text(" "), emoji("taco")]);

  await expect.poll(replies).toEqual([{ items: ["🎁 *An item for thanking Ada*"], button: identify, opens: "/book" }]);

  await slack.post(giver, [text("and for the pairing "), mention(ada), text(" "), mention(grace), text(" "), emoji("taco")]);

  await expect.poll(async () => (await replies())[1]).toEqual({
    items: ["🎁 Your next item for Ada comes next week", "🎁 *An item for thanking Grace*"],
    button: "Identify them on the website",
    opens: "/book",
  });
});
