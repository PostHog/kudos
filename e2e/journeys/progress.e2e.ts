import { expect, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

test("the website's quests this week move on as the member's own kudos finish them", async ({ slack, website }) => {
  const [member, first, second] = [await slack.member(), await slack.member(), await slack.member()];
  const replies = async () => (await slack.ephemeralsTo(member)).length;
  const give = async (to: string, words: string) => {
    const before = await replies();
    await slack.post(member, [text(`${words} `), mention(to), text(" "), emoji("taco")]);
    await expect.poll(replies).toBe(before + 1);
  };
  await give(first, "thanks for the review");

  // The week's two quests, one for hugs and one for kudos, each as the activity page lists it: done or not, and its goal.
  await website.signIn(member, { path: "/activity" });
  await website.pastTheMoments();
  const quests = website.screen.getByRole("region", { name: "This week's quests" });
  await expect(quests.getByRole("heading")).toHaveText(/^This week's quests · 0 of 2$/i);
  const shown = () => website.browser.evaluate(() => [...document.querySelectorAll("section[aria-label=\"This week's quests\"] li")].map((row) => `${row.querySelector("[role=img]")?.getAttribute("aria-label")}: ${row.querySelector(".al-check-goal")?.textContent}`));
  await expect.poll(shown).toEqual(["Not done: Give 3 hugs", "Not done: Thank someone new"]);

  // The member's next kudos, to a teammate they haven't thanked before, finishes the kudos quest, and the next one
  // shows in its place, as it does on a fresh visit. The hugs quest stays as it was.
  await give(second, "and for the pairing");
  await expect.poll(shown).toEqual(["Not done: Give 3 hugs", "Not done: Thank someone on two different days"]);
  await website.open("/activity");
  await expect.poll(shown).toEqual(["Not done: Give 3 hugs", "Not done: Thank someone on two different days"]);
});
