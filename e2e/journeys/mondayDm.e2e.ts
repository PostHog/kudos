import { button, checklistOf, labelsOf } from "../home.ts";
import { expect, test } from "../test.ts";
import { emoji, mention, text, type Shown, type Slack } from "../slack.ts";
import { untilNext } from "../time.ts";

// Each clock step may take the seam's 25 s budget, and this journey takes several, so it outlasts the suite's minute.
const clockedJourneyMs = 180_000;

const hourMs = 60 * 60 * 1000;
const minuteMs = 60 * 1000;

// The Monday DMs a member got, oldest first, each as it shows now.
const mondayDmsOf = async (slack: Slack, member: string) => (await slack.messagesIn(member)).filter((message) => message.text.startsWith(":taco: Your week in hugs"));

// What a member reads in a Monday DM: its opening lines (the hugs recap and the week's heading), its quests, and the
// buttons under them.
const read = (dm: Shown | undefined) => dm && { opening: dm.text.split("\n").slice(0, 3), quests: checklistOf(dm), buttons: labelsOf({ blocks: dm.blocks ?? [] }) };

const stoppedNote = "🔕 *Done, no more Monday quests from me.* Your hugs recap still comes on Mondays. Changed your mind? One press brings them back.";

test("the Monday direct message recaps a member's hugs and quests at 9:00 on their Monday, and its button stops and resumes the quests", { tags: ["@time"], timeout: clockedJourneyMs }, async ({ slack, time }) => {
  const [member, teammate, author] = [await slack.member(), await slack.member(), await slack.member()];
  // A first kudos starts the member's quests, and a hug gives the week a recap.
  await slack.post(member, [text("thanks "), mention(teammate), text(" "), emoji("taco")]);
  await expect.poll(async () => (await slack.ephemeralsTo(member)).length).toBe(1);
  await slack.react(member, await slack.post(author, [text("shipped the release")]), "taco");
  await time.settle();
  await time.runCron("mondayDm.mondayDm.ensureMondayDms");

  // The DM comes at 9:00 on the Monday after, by the member's own clock.
  const untilTheirMonday = untilNext((await time.now()) + slack.hoursAheadOf(member) * hourMs, 1, 9);
  await time.advance(untilTheirMonday - 2 * minuteMs);
  await time.settle();
  expect(await mondayDmsOf(slack, member)).toEqual([]);
  await time.advance(2 * minuteMs);
  await time.settle();

  const quests = [
    ":point_right: Give 3 hugs  1 of 3 hugs\nReact to any message with :taco:.  🎁 +20 XP and an unidentified Hoggie for your collection",
    ":white_circle: Thank someone new\nSomeone from another team counts too.  🎁 +50 XP and an unidentified Hoggie for your collection",
  ];
  const opening = [":taco: Your week in hugs", "You reacted :taco: and gave 1 hug (+10 XP).", "Happy Monday :sun_with_face: Here are two quests for your week."];
  const [dm] = await mondayDmsOf(slack, member);
  expect(read(dm)).toEqual({ opening, quests, buttons: ["Identify them on the website", "See your quests", "Stop Monday quests"] });

  // Stopping turns the DM into a note with a way back, and the next Monday's DM recaps the hugs alone.
  await slack.clickOn(member, dm!, button({ blocks: dm!.blocks ?? [] }, "Stop Monday quests"));
  await expect.poll(async () => read((await mondayDmsOf(slack, member))[0])).toEqual({ opening: [...opening.slice(0, 2), stoppedNote], quests: [], buttons: ["Turn Monday quests back on"] });
  await slack.react(member, await slack.post(author, [text("fixed the build")]), "taco");
  await time.settle();
  await time.runCron("mondayDm.mondayDm.ensureMondayDms");
  await time.advance(untilNext((await time.now()) + slack.hoursAheadOf(member) * hourMs, 1, 9));
  await time.settle();
  await expect.poll(async () => (await mondayDmsOf(slack, member)).map((shown) => shown.text.split("\n")[1])).toEqual(["You reacted :taco: and gave 1 hug (+10 XP).", "You reacted :taco: and gave 1 hug (+10 XP)."]);
  expect(read((await mondayDmsOf(slack, member))[1])).toMatchObject({ quests: [], buttons: [] });
  expect((await mondayDmsOf(slack, member))[1]?.text).not.toContain("Happy Monday");

  // The note's button brings the quests back into the DM it sits in.
  const stopped = (await mondayDmsOf(slack, member))[0]!;
  await slack.clickOn(member, stopped, button({ blocks: stopped.blocks ?? [] }, "Turn Monday quests back on"));
  await expect.poll(async () => read((await mondayDmsOf(slack, member))[0])?.buttons).toContain("Stop Monday quests");
  expect(read((await mondayDmsOf(slack, member))[0])?.opening).toEqual(opening);
});
