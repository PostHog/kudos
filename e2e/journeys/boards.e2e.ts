import { expect, test } from "../test.ts";
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

  const rowsOf = (board: string) => board.split("\n").filter((line) => [keen, steady, author].some((member) => line.includes(`<@${member}>`)));
  const boards = async () =>
    Promise.all(
      periods.map(async (period) => {
        const [shown] = await slack.responsesTo(await slack.command(steady, channel, period));
        return rowsOf(String(shown?.text)).map((row) => row.replace(/^\S+ /, ""));
      }),
    );
  const ranked = [`<@${keen}> · 3 hugs`, `<@${steady}> · 1 hug`];
  await expect.poll(boards).toEqual([ranked, ranked, ranked]);
});
