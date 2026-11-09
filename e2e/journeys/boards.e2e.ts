import { test } from "../test.ts";
import { emoji, mention, text } from "../slack.ts";

const periods = ["leaderboard", "leaderboard month", "leaderboard all"];

// Production's boards rank the hugs a member gave. Other journeys hug too, so this one reads its own members' rows and
// their order, not their places.
test("the leaderboards rank members by the hugs they gave this week, this month and all time, never by what they received", async ({ slack }) => {
  const [keen, steady, author] = [await slack.member(), await slack.member(), await slack.member()];
  const channel = await slack.channel();
  const messages = [];
  for (const news of ["shipped the docs", "fixed the build", "closed the incident"]) messages.push(await slack.post(author, [text(news)]));
  await slack.post(keen, [text("thanks "), mention(author), text(" "), emoji("taco")]);

  for (const message of messages) await slack.react(keen, message, "taco");
  await slack.react(steady, messages[0]!, "taco");

  // A board's rows for this journey's members, without their medals or places, in the board's order.
  const rowsOf = (board: string) => board.split("\n").filter((line) => [keen, steady, author].some((member) => line.includes(`<@${member}>`))).map((row) => row.replace(/^\S+ /, ""));
  const ranked = JSON.stringify([`<@${keen}> · 3 hugs`, `<@${steady}> · 1 hug`]);
  // The hugs land a moment after their reactions, so each board is read until it ranks them; a failure names its rows.
  for (const period of periods) await slack.askUntil(steady, channel, period, (answer) => JSON.stringify(rowsOf(answer)) === ranked);
});
