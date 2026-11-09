import { isBoard, test } from "../test.ts";
import { text } from "../slack.ts";

// Each clock step may take the seam's 25 s budget, and this journey takes several, so it outlasts the suite's minute.
const clockedJourneyMs = 180_000;

const dayMs = 24 * 60 * 60 * 1000;

// How far the clock must move from `now` to reach noon UTC on `day` of the month `months` after now's.
function untilDayOfMonth(now: number, months: number, day: number) {
  const at = new Date(now);
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, day, 12) - now;
}

test("the week and month boards stop counting hugs once their period ends, and the all-time board keeps them", { tags: ["@time"], timeout: clockedJourneyMs }, async ({ slack, time }) => {
  // The hug lands at noon on the 10th, so eight days on is another week of the same month, whatever day weeks start on.
  await time.advance(untilDayOfMonth(await time.now(), 1, 10));
  await time.settle();
  // A new member's day sits at noon, so this one's clock is UTC's.
  const [hugger, author] = [await slack.member(), await slack.member()];
  const channel = await slack.channel();
  await slack.react(hugger, await slack.post(author, [text("shipped the docs")]), "taco");
  // The hug lands once the app has looked up both members, which are new to it, so the jobs that do so run first.
  await time.settle();

  // A board shows its top three and the member who asks for it, so the hugger reads their own row on each.
  const counts = (answer: string) => answer.includes(`<@${hugger}> · 1 hug`);
  const ask = (period: string, counted: boolean) => slack.askUntil(hugger, channel, period, (answer) => isBoard(answer) && counts(answer) === counted, { withinMs: 30_000 });
  await ask("leaderboard", true);
  await ask("leaderboard month", true);
  await ask("leaderboard all", true);

  await time.advance(8 * dayMs);
  await time.settle();
  await ask("leaderboard", false);
  await ask("leaderboard month", true);
  await ask("leaderboard all", true);

  await time.advance(untilDayOfMonth(await time.now(), 1, 3));
  await time.settle();
  await ask("leaderboard month", false);
  await ask("leaderboard all", true);
});
