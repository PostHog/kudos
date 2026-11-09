import { expect, test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";
import type { Website } from "../website.ts";

// Turning items plays a flight for each, so this journey outlasts the suite's minute.
const turningJourneyMs = 180_000;

// The website greets a member with its moments (an emoji they unlocked, a level they reached) before the board of
// items that wait for them, and between the items they turn; the member closes each moment until the board shows,
// ready for the next item.
async function untilTheBoard(website: Website) {
  const board = website.screen.getByRole("dialog", { name: "Your items" });
  const offered = website.screen.getByRole("button", { name: /^\d+\+? unidentified items? waits?$/ });
  for (let moment = 0; moment < 15; moment++) {
    if (await board.waitFor({ state: "visible", timeout: 2_000 }).then(() => true, () => false)) {
      if ((await board.getAttribute("aria-busy")) !== "true") return board;
    } else if (await offered.isVisible()) await offered.click();
    else if (await website.screen.getByRole("dialog").first().isVisible()) await website.browser.keyboard.press("Escape");
  }
  throw new Error("the website never showed the items that wait");
}

// What the website said as it identified an item, in order: what the item was, such as "Ada Example: Sticker · New"
// for a teammate's sticker or "Name: Rare hoggie · New" for a hoggie, and then any medal or emoji it unlocked.
async function turn(website: Website, name: string) {
  const board = await untilTheBoard(website);
  await board.getByRole("button", { name, exact: true }).first().click();
  // The flight's status says each step aloud, then goes with the flight; a read of the page catches every step.
  const identifying = () => website.browser.evaluate(() => document.querySelector("[role=status][aria-label=Identifying]")?.textContent?.trim() ?? null);
  const said: string[] = [];
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    const now = await identifying();
    if (now === null && said.length > 0) return said;
    if (now !== null && now !== "" && now !== said.at(-1)) said.push(now);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the item was still being identified after it said ${JSON.stringify(said)}`);
}

// A hoggie as the website says it identified one, "Name: Rare hoggie · New", and as the book lists it once found,
// "Name, Rare, one copy".
const hoggieTurned = /^(.+): (Common|Uncommon|Rare|Epic|Legendary) hoggie(?: · New)?$/;
const hoggieListed = /^(.+), (Common|Uncommon|Rare|Epic|Legendary), (?:one copy|\d+ copies)$/;

test("the book shows the items a member's kudos brought them face down, and lists the hoggies they identify there", { timeout: turningJourneyMs }, async ({ slack, website }) => {
  const [member, ada] = [await slack.member(), await slack.member({ real_name: "Ada Example" })];
  await slack.post(member, [text("thanks for the review "), mention(ada), text(" "), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(member)).map((reply) => String(reply.text))).toEqual([expect.stringContaining("🎁 *An item for thanking Ada*")]);

  // The reply's button leads to the book, where the items wait face down until the member identifies them.
  await website.signIn(member, { path: "/book" });
  const board = await untilTheBoard(website);
  await expect(board.getByRole("heading")).toHaveText(/^\d+ unidentified items wait$/);
  const unlabelled = "An unidentified item. Identify it";
  await expect(board.getByRole("button", { name: unlabelled, exact: true }).first()).toBeVisible();

  // Among them is the item for thanking Ada, which turns into her sticker; the others the kudos brought turn into
  // hoggies.
  const turned: string[] = [];
  while (!turned.includes("Ada Example: Sticker · New")) {
    const left = (await untilTheBoard(website)).getByRole("button", { name: unlabelled, exact: true });
    expect(await left.first().isVisible(), `no item for thanking Ada waits; the items turned showed ${JSON.stringify(turned)}`).toBe(true);
    turned.push(...(await turn(website, unlabelled)));
  }
  const found = [...new Set(turned.filter((said) => hoggieTurned.test(said)).map((said) => said.replace(hoggieTurned, "$1, $2")))].sort();
  expect(found.length, `the items turned showed ${JSON.stringify(turned)}`).toBeGreaterThan(0);

  // The book's collection lists the hoggies the member found, and only those. The items still waiting stay for later.
  await website.open("/book#hoggies");
  const listed = () => website.browser.evaluate(() => [...document.querySelectorAll("button[aria-label]")].map((button) => button.getAttribute("aria-label")!));
  await expect.poll(async () => [...new Set((await listed()).filter((name) => hoggieListed.test(name)).map((name) => name.replace(hoggieListed, "$1, $2")))].sort()).toEqual(found);
  await expect(website.screen.getByRole("button", { name: new RegExp(`^Found\\s*${found.length}$`) })).toBeVisible();
});
