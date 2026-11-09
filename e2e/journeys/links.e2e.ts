import { expect, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("a link to a member's page on the website, posted in Slack, unfurls into a preview of their card", async ({ slack, website }) => {
  const [member, friend] = [await slack.member(), await slack.member()];
  const channel = await slack.channel("public", { joined: true });
  const given = await slack.post(member, [text("thanks for the review "), mention(friend), text(" "), emoji("taco")], { channel: channel.id });
  await expect.poll(() => slack.reactionsOn(given)).toEqual(["taco"]);

  // The member copies their page's link from the website. The browser's clipboard keeps what they copy.
  await website.browser.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (copied: string) => void ((window as unknown as { copied?: string }).copied = copied) } });
  });
  // The book opens on the member's own page, which offers its link to share.
  await website.signIn(member, { path: "/book" });
  // The XP since the last visit plays over the page, then the items that wait show, so the member closes moments
  // until the page beneath them answers.
  const share = website.screen.getByRole("button", { name: "Share" });
  for (let moments = 0; !(await share.click({ timeout: 3_000 }).then(() => true, () => false)); moments++) {
    expect(moments, "the website kept the member's page covered").toBeLessThan(10);
    await website.pastTheMoments();
  }
  await expect(website.screen.getByRole("status", { name: "Sharing" })).toHaveText("Link copied. Paste it in Slack to show your card.");
  const link = await website.browser.evaluate(() => (window as unknown as { copied?: string }).copied ?? "");
  const page = new URL(link);
  expect(page.hash).toMatch(/^#people\/\w+$/);

  const shared = await slack.post(member, [text(`here's my card ${link}`)], { channel: channel.id });
  await slack.shareLinks(shared, [link]);

  // The app answers with a preview for that link: the member's card, named and linked to their page. It shows as a
  // picture of the card, or as its words when the picture takes too long to draw.
  const unfurls = async () => (await slack.callsTo("chat.unfurl")).filter((call) => call.channel === channel.id && call.ts === shared.ts).map((call) => call.unfurls as Record<string, { blocks: unknown[] }>);
  await expect.poll(async () => (await unfurls()).map(Object.keys)).toEqual([[link]]);
  const [preview] = await unfurls();
  expect(JSON.stringify(preview![link]!.blocks)).toContain(`*<${page.origin}/book?src=link-card${page.hash}|Member ${member}>*`);
});
