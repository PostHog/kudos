// The XP moment plays what happened since the last visit: today's convex/website/xpMoment.test.ts, on the service's test
// backend. Each reader is a `me` made from the seeded directory row, as S15's member check answers it; getXpMoment is
// this slice's read, and arrive and endXpMoment its commands, run with the person the directory knows in the same
// mutation; getAlbum is S16's handler and runs as itself; turnItem is S16's command, which has no route yet, so a turn
// ends at a stand-in for its stub. The kudos, hugs and deletions go through the front door, guarded until the stacks that
// handle them register. Today's tests held a job back by cancelling its scheduled functions and ran it later; here the
// backend's registry holds that job's runs back while a kudos settles, and the test runs them later. The guard tests
// whose subject is the member check (closed, signed out, an argument naming a member) call the moment's read and command
// by their route names through the whole app, signed in through SSO or not at all, so the app's own identity mapping and
// member check (S15) answer them.
import { asc, desc, eq, getTableName } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { emoji, mention, messageDeletedEvent, messageEvent, reactionEvent, section, text } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { tallyKudosGivenJob } from "../album/tallies.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import { awards, weekTallies } from "../db/schema/index.ts";
import type { TableName } from "../db/schema/index.ts";
import { jobs } from "../db/schema/service.ts";
import type { HomeMember } from "../feedback/homes.ts";
import type { Job, MutationJob } from "../jobs/define.ts";
import { dataModelTables } from "../load/loader.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext } from "../operations.ts";
import { recordEffectsJob } from "../progression/progression.ts";
import { onboardingGoalOf } from "../quests/onboarding.ts";
import { followKudosGivenJob } from "../quests/quests.ts";
import { startQuests } from "../quests/start.ts";
import { drawNewWeek, weeklyQuestsOf } from "../quests/weekly.ts";
import { createRegistry, type Registration } from "../registration.ts";
import { domains, serviceRegistry } from "../registry.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import { getAlbum, type AlbumAnswer, type AlbumRead, type TurnAnswer } from "./album.ts";
import { arrive as arriveAt, moveLastVisitTo, type ArrivalAnswer } from "./lastVisit.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { argumentsRefused, signedInThroughSso, websiteAs } from "./routesTesting.ts";
import { endXpMoment, getXpMoment, type XpMoment, type XpMomentAnswer, type XpMomentEndReply } from "./xpMoment.ts";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * 60 * minuteMs;
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs", "xp-levels", "unlocks", "hugs"];
const everyFlagOfTheMoment = [...albumOpen, "hidden-items", "xp-moments"];

// What each step reaches past this stack's handlers:
// - a kudos, a hug or a deletion through Slack, whose events every domain's subscribers take: the parser and engine
//   (S4), replies (S5), progression (S6), quests and the wallet (S7), the album (S8, S9, S10), groups and boards (S11),
//   activity (S12), hugs (S13) and analytics (S14);
const giving: Stack[] = ["S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14"];
// - getXpMoment: the album flag and the thoughtful givers (S9), the first-thanks top-up and the progression (S6), the
//   waiting items (S8), and the quest and milestone moves behind the beats (S7's quests, S9's milestones);
const reading: Stack[] = ["S6", "S7", "S8", "S9"];
// - an arrival or an end: the album flag, stickers and team stickers (S9), the hidden-items flag and the turns (S8),
//   the hoggie tallies (S10), the newest award received (S4), the first-thanks moment (S6), and the usage fact (S14);
const ending: Stack[] = ["S4", "S6", "S8", "S9", "S10", "S14"];
// - getAlbum's read (S16's handler) and what it answers: awards (S4), the items (S8), the album flag and stickers (S9)
//   and hugs (S13); a turn: S16's turnItem;
const album: Stack[] = ["S4", "S8", "S9", "S13", "S16"];
// - the weekly quests: the draw and the week read (S7).
const quests: Stack[] = ["S7"];

function stacks(...steps: Stack[][]): [Stack, ...Stack[]] {
  const all = [...new Set(steps.flat())].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return all as [Stack, ...Stack[]];
}

// Every step a test of the moment takes: kudos, the moment, an arrival or an end.
const momentAndGiving = stacks(giving, reading, ending);
const withTheAlbum = stacks(giving, reading, ending, album);
const withTheWeek = stacks(giving, reading, ending, quests);

type Person = { user: string; name: string };

const alice = person("Alice", "Marchetti");
const bob = person("Bob", "Okonkwo");
const carol = person("Carol", "Lindqvist");
const everyone = [alice, bob, carol];

// Today's `settleHoldingBack(name)` cancelled the job's scheduled runs; here the job's registered runs keep their
// arguments and do nothing while `holding` names them, and `record()` runs them afterwards.
let holding: { name: string; heldBack: unknown[] } | null = null;
const wrapped = new Map<Job, Job>();
const holdable = (job: Job): Job => {
  if (job.kind !== "mutation" || ![recordEffectsJob.name, followKudosGivenJob.name, tallyKudosGivenJob.name].includes(job.name)) return job;
  if (!wrapped.has(job)) {
    wrapped.set(job, {
      ...job,
      handler: async (ctx: MutationContext, args: unknown) => {
        if (holding?.name === job.name) return void holding.heldBack.push(args);
        return job.handler(ctx, args);
      },
    } satisfies MutationJob);
  }
  return wrapped.get(job)!;
};
const holdingRegistry = createRegistry(
  Object.fromEntries(
    Object.entries(domains).map(([name, registration]: [string, Registration]) => [
      name,
      { ...registration, ...(registration.jobs && { jobs: registration.jobs.map(holdable) }), ...(registration.subscribers && { subscribers: registration.subscribers.map((subscription) => ({ ...subscription, job: holdable(subscription.job) as typeof subscription.job })) }) },
    ]),
  ),
);

const backend = useTestBackend({ now: tuesday.getTime(), workspace: "T1", registry: holdingRegistry });

let t: TestBackend;
let messages = 0;

beforeEach(async () => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  t = backend();
  messages = 0;
  holding = null;
  for (const { user, name } of everyone) t.slack.withMember(user, { real_name: name, profile: { display_name: name, real_name: name } });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 });
  await switchWebsite(...everyFlagOfTheMoment);
  // The members rows each `team_join` wrote.
  for (const { user, name } of everyone) await t.seed.insert("members", { workspace: "T1", user, kind: "member", name, realName: name, displayName: name, asOf: tuesday.getTime() });
  await settle();
});

afterEach(() => void vi.unstubAllEnvs());

describe("LP27 LP28: getXpMoment plays what happened since the last visit", () => {
  waitsOn(momentAndGiving, "answers none with the last visit to arrive from before the member's first last visit and when nothing was decided since it", async () => {
    const asAlice = await signedIn(alice);
    await thanks(bob, alice);

    expect(await momentOf(asAlice)).toEqual({ kind: "none", lastVisit: null });
    const arrived = await arrive(asAlice, null);
    expect(await momentOf(asAlice)).toEqual({ kind: "none", lastVisit: (arrived as { lastVisit: number }).lastVisit });
  }, 60_000);

  waitsOn(withTheAlbum, "a busy return answers each kind since the last visit oldest first with its XP, the climb from the standing before the moment's XP to now, and the waiting items", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(bob, alice);
    await thanks(alice, carol);
    await hug(bob, alice, aMessageNow());
    await hug(alice, carol, aMessageNow());

    const moment = await theMomentOf(asAlice);

    expect(moment.excerpts.map(({ entry, xp }) => [entry.kind, xp])).toEqual([
      ["kudosReceived", 5],
      ["kudosGiven", 10],
      ["levelUp", 0],
      ["hugReceived", 1],
      ["hugGiven", 1],
    ]);
    expect(moment.fold).toBeNull();
    expect(moment.moments).toBe(4);
    expect([moment.climb.from.level, moment.climb.to.level]).toEqual([1, 2]);
    expect(moment.xp).toBe(17);
    const { level, board } = await albumOf(asAlice);
    expect(moment.climb.to).toEqual(level);
    expect(moment.climb.to.xp - moment.climb.from.xp).toBe(17);
    expect(moment.waiting).toBe(board!.items.length);
    expect(moment.excerpts[0]!.entry).toMatchObject({ kind: "kudosReceived", giver: { name: bob.name } });
  }, 60_000);

  waitsOn(momentAndGiving, "each mention in an excerpt names the member it means, so the reader's own mention tells apart from a namesake's", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(bob, alice);

    const { entry } = (await theMomentOf(asAlice)).excerpts[0]!;

    expect(entry).toMatchObject({ kind: "kudosReceived", message: { segments: expect.arrayContaining([{ kind: "person", name: alice.name, person: await memberOf(alice) }]) } });
  }, 60_000);

  waitsOn(momentAndGiving, "past five, the newest five show oldest first and the rest fold into one line with their XP", async () => {
    const asAlice = await aReturningMember(alice);
    const received: number[] = [];
    for (let kudos = 0; kudos < 7; kudos += 1) received.push((await thanks(kudos % 2 === 0 ? bob : carol, alice)).at);

    const moment = await theMomentOf(asAlice);

    expect(moment.excerpts.map(({ entry }) => entry.kind)).toEqual(["levelUp", "kudosReceived", "kudosReceived", "kudosReceived", "kudosReceived"]);
    expect(moment.excerpts.slice(1).map(({ entry }) => entry.at)).toEqual(received.slice(3));
    expect(moment.fold).toEqual({ count: 3, xp: 15 });
    expect(moment.moments).toBe(7);
    expect(moment.xp).toBe(35);
  }, 60_000);

  waitsOn(momentAndGiving, "a kudos deleted in Slack since the last visit leaves the moment and its count, the kudos before it still plays, and the next arrival moves past both", async () => {
    const asAlice = await aReturningMember(alice);
    const kept = await thanks(bob, alice);
    const deleted = await thanks(carol, alice);
    await deleteMessage({ user: carol.user, ts: deleted.ts });
    await settle();

    const moment = await theMomentOf(asAlice);
    expect(moment.excerpts.filter(({ entry }) => entry.kind === "kudosReceived").map(({ entry }) => entry.at)).toEqual([kept.at]);
    const ended = await endOf(asAlice, moment, { skipped: true });
    await settle();

    expect(t.postHog.productEvents().filter(({ event }) => event === "xp moment ended").map(({ properties }) => properties)).toEqual([expect.objectContaining({ excerpts_shown: moment.excerpts.length, folded: 0 })]);
    expect(await momentOf(asAlice)).toMatchObject({ kind: "none" });
    const arrived = await arrive(asAlice, (ended as { lastVisit: number }).lastVisit);
    expect((arrived as { lastVisit: number }).lastVisit).toBeGreaterThan(moment.until);
  }, 60_000);

  waitsOn(momentAndGiving, "a moment whose newest kudos is taken back in Slack while it plays still ends past it, counting what it played", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(bob, alice);
    const newest = await thanks(carol, alice);
    const moment = await theMomentOf(asAlice);

    await deleteMessage({ user: carol.user, ts: newest.ts });
    await settle();

    expect(await endAsTheWebsiteDoes(asAlice, moment)).toMatchObject({ kind: "arrived", lastVisit: moment.until });
    await settle();

    expect(await momentOf(asAlice)).toMatchObject({ kind: "none" });
    expect(t.postHog.productEvents().filter(({ event }) => event === "xp moment ended").map(({ properties }) => properties)).toEqual([expect.objectContaining({ excerpts_shown: moment.excerpts.length, folded: 0 })]);
  }, 60_000);

  waitsOn(momentAndGiving, "a level crossed is always among the excerpts, however many newer kudos came in", async () => {
    const asCarol = await aReturningMember(carol);
    await thanks(carol, alice, bob);
    for (let kudos = 0; kudos < 6; kudos += 1) await thanks(kudos % 2 === 0 ? bob : alice, carol);

    const moment = await theMomentOf(asCarol);

    expect(moment.excerpts.map(({ entry }) => entry.kind)).toEqual(["levelUp", "kudosReceived", "kudosReceived", "kudosReceived", "kudosReceived"]);
    expect(moment.excerpts[0]!.entry).toMatchObject({ kind: "levelUp", level: 2 });
    expect(moment.fold).toEqual({ count: 3, xp: 30 });
    expect(moment.climb.from.level).toBe(1);
    expect(moment.climb.to.level).toBe(2);
  }, 60_000);

  waitsOn(momentAndGiving, "hugs on the member's message count only those since the last visit", async () => {
    const message = aMessageNow();
    await hug(bob, alice, message);
    const asAlice = await signedIn(alice);
    await arrive(asAlice, null);
    later();
    await hug(carol, alice, message);

    const moment = await theMomentOf(asAlice);

    expect(moment.excerpts.map(({ entry, xp }) => [entry.kind, "hugs" in entry ? entry.hugs : null, xp])).toEqual([["hugReceived", 1, 1]]);
  }, 60_000);

  waitsOn(momentAndGiving, "a kudos whose XP progression hasn't recorded yet waits out of the moment, with everything after it, and plays with its XP once recorded", async () => {
    const asAlice = await aReturningMember(alice);
    const recorded = await thanks(bob, alice);
    const held = await thanksWhileItsXpWaits(carol, alice);
    const after = await thanks(bob, alice);

    const moment = await theMomentOf(asAlice);
    expect(moment.excerpts.map(({ entry }) => entry.at), "the moment while the XP waits").toEqual([recorded.at]);
    await endOf(asAlice, moment);
    await held.record();

    const next = await theMomentOf(asAlice);
    expect(next.excerpts.filter(({ entry }) => entry.kind === "kudosReceived").map(({ entry, xp }) => [entry.at, xp]), "the next moment").toEqual([
      [held.at, 5],
      [after.at, 5],
    ]);
  }, 60_000);

  waitsOn(withTheAlbum, "a moment held short of a kudos whose XP waits climbs from the standing at the last visit by only the XP it plays, and the next moment climbs on from where it ended", async () => {
    const asAlice = await aReturningMember(alice);
    const before = (await albumOf(asAlice)).level;
    await thanks(bob, alice);
    const held = await thanksWhileItsXpWaits(carol, alice);
    await thanks(bob, alice);

    const moment = await theMomentOf(asAlice);
    expect(moment.climb.from, "the held-short moment's start").toEqual(before);
    expect(moment.climb.to.xp - moment.climb.from.xp, "the held-short moment's climb").toBe(moment.xp);
    await endOf(asAlice, moment);
    await held.record();

    const next = await theMomentOf(asAlice);
    expect(next.climb.from, "the next moment's start").toEqual(moment.climb.to);
    expect(next.climb.to, "the next moment's end").toEqual((await albumOf(asAlice)).level);
  }, 60_000);

  waitsOn(momentAndGiving, "a kudos whose XP progression never records stops holding the moment ten minutes after it was decided", async () => {
    const asAlice = await aReturningMember(alice);
    const held = await thanksWhileItsXpWaits(carol, alice);
    expect(await momentOf(asAlice), "while the XP waits").toMatchObject({ kind: "none" });

    t.time.advance(10 * minuteMs);

    expect((await theMomentOf(asAlice)).excerpts.map(({ entry }) => entry.at), "ten minutes on").toEqual([held.at]);
  }, 60_000);

  waitsOn(momentAndGiving, "LP40 LP41 HH11: the moment carries this week's givers of any kudos where xp-moments is on, with teasers off, and none below three", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(alice, bob);
    expect((await theMomentOf(asAlice)).thoughtfulGivers).toBeNull();
    later();

    await kudosSentAt(t.clock.now(), "ty", carol, bob);

    expect((await theMomentOf(asAlice)).thoughtfulGivers).toBe(3);
  }, 60_000);

  waitsOn(momentAndGiving, "with xp-moments off, getXpMoment answers off and the arrival moves the last visit as it did before", async () => {
    await switchWebsite(...albumOpen, "hidden-items");
    await thanks(bob, alice);
    const receivedAt = await newestKudosDecidedFor(alice);
    const asAlice = await signedIn(alice);
    await thanks(alice, carol);

    expect(await momentOf(asAlice)).toEqual({ kind: "off" });
    expect(await arrive(asAlice, null)).toEqual({ kind: "arrived", lastVisit: receivedAt });
  }, 60_000);

  waitsOn(momentAndGiving, "with xp-moments on and hidden-items off, the last visit is still kept so the moment can play", async () => {
    await switchWebsite(...albumOpen, "xp-moments");
    const asAlice = await signedIn(alice);
    await thanks(bob, alice);
    expect(await arrive(asAlice, null)).toMatchObject({ kind: "arrived", lastVisit: expect.any(Number) });
    later();
    await thanks(bob, alice);

    const moment = await theMomentOf(asAlice);

    expect(moment.excerpts.map(({ entry }) => entry.kind)).toEqual(["kudosReceived"]);
    expect(moment.waiting).toBe(0);
  }, 60_000);
});

describe("LP26 LP35: endXpMoment moves the last visit to the newest instant the moment read", () => {
  waitsOn(momentAndGiving, "ending moves the last visit to the newest instant read, never the clock, so what was decided while it played waits for the next moment", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(bob, alice);
    const moment = await theMomentOf(asAlice);
    const whilePlaying = await thanks(carol, alice);
    later();

    expect(await endOf(asAlice, moment)).toEqual({ kind: "arrived", lastVisit: moment.until });

    const next = await theMomentOf(asAlice);
    expect(next.since).toBe(moment.until);
    expect(next.excerpts.map(({ entry }) => entry.at)).toEqual([whilePlaying.at]);
  }, 60_000);

  waitsOn(momentAndGiving, "an arrival after a read that answered none moves nothing past a kudos decided since that read, so the next read plays it", async () => {
    const asAlice = await aReturningMember(alice);
    const read = await momentOf(asAlice);
    expect(read).toMatchObject({ kind: "none" });
    const lastVisit = (read as { lastVisit: number }).lastVisit;
    const sinceTheRead = await thanks(bob, alice);

    expect(await arrive(asAlice, lastVisit), "the arrival after the read").toEqual({ kind: "arrived", lastVisit });

    const next = await theMomentOf(asAlice);
    expect(next.excerpts.map(({ entry }) => entry.at), "the next read").toEqual([sinceTheRead.at]);
  }, 60_000);

  waitsOn(momentAndGiving, "a second tab reads the same moment until one ends it, and ending the older moment moves nothing", async () => {
    const tab = await aReturningMember(alice);
    const otherTab = await signedIn(alice);
    await thanks(bob, alice);
    const moment = await theMomentOf(tab);
    expect(await theMomentOf(otherTab)).toEqual(moment);
    await endOf(tab, moment);
    await thanks(carol, alice);
    const before = await everythingWritten();

    expect(await endOf(otherTab, moment)).toEqual({ kind: "arrived", lastVisit: moment.until });
    expect(await everythingWritten()).toEqual(before);
  }, 60_000);

  waitsOn(momentAndGiving, "LP61: a moment started from the glow after the visit's own one ended moves the last visit on to the newest instant it read, and never plays or moves for the collected one again", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(bob, alice);
    const visitsOwn = await theMomentOf(asAlice);
    await endOf(asAlice, visitsOwn);
    const cameInSince = await thanks(carol, alice);
    later();

    const missed = await theMomentOf(asAlice);
    expect(missed.since, "the glow's moment starts where the visit's own ended").toBe(visitsOwn.until);
    expect(missed.excerpts.map(({ entry }) => entry.at)).toEqual([cameInSince.at]);
    expect(await endOf(asAlice, missed)).toEqual({ kind: "arrived", lastVisit: missed.until });
    expect(await momentOf(asAlice), "the collected moments").toEqual({ kind: "none", lastVisit: missed.until });

    const before = await everythingWritten();
    expect(await endOf(asAlice, visitsOwn), "ending the visit's own moment again").toEqual({ kind: "arrived", lastVisit: missed.until });
    expect(await everythingWritten()).toEqual(before);
  }, 60_000);

  waitsOn(momentAndGiving, "an instant no moment read moves nothing", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(bob, alice);
    const moment = await theMomentOf(asAlice);
    const before = await everythingWritten();

    expect(await endOf(asAlice, { ...moment, until: moment.until + minuteMs })).toEqual({ kind: "arrived", lastVisit: moment.since });
    expect(await everythingWritten()).toEqual(before);
  }, 60_000);

  waitsOn(momentAndGiving, "LP36: ending records the excerpts the website says it showed and folded, more than five when level-ups crossed, and at most the moment's 50 entries", async () => {
    const asAlice = await aReturningMember(alice);
    for (let kudos = 0; kudos < 2; kudos += 1) await thanks(bob, alice);
    const moment = await theMomentOf(asAlice);

    await end(asAlice, { from: moment.since, until: moment.until, skipped: false, played: { shown: 7, folded: 2 } });
    await settle();

    expect(t.postHog.productEvents().filter(({ event }) => event === "xp moment ended").map(({ properties }) => properties)).toEqual([expect.objectContaining({ excerpts_shown: 7, folded: 2 })]);
  }, 60_000);

  waitsOn(momentAndGiving, "LP36: played counts the website sends are held within the moment's 50 entries", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(bob, alice);
    const moment = await theMomentOf(asAlice);

    await end(asAlice, { from: moment.since, until: moment.until, skipped: false, played: { shown: 999, folded: -3 } });
    await settle();

    expect(t.postHog.productEvents().filter(({ event }) => event === "xp moment ended").map(({ properties }) => properties)).toEqual([expect.objectContaining({ excerpts_shown: 50, folded: 0 })]);
  }, 60_000);

  waitsOn(momentAndGiving, "LP36: ending records xp moment ended with skipped, excerpts_shown and folded, a crossed level among the excerpts shown", async () => {
    const asAlice = await aReturningMember(alice);
    for (let kudos = 0; kudos < 6; kudos += 1) await thanks(bob, alice);
    const moment = await theMomentOf(asAlice);

    await endOf(asAlice, moment, { skipped: true });
    await settle();

    expect(t.postHog.productEvents().filter(({ event }) => event === "xp moment ended").map(({ properties }) => properties)).toEqual([expect.objectContaining({ skipped: true, excerpts_shown: 5, folded: 2 })]);
  }, 60_000);

  waitsOn(momentAndGiving, "with xp-moments off, ending answers refused and writes nothing at all", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(bob, alice);
    const moment = await theMomentOf(asAlice);
    await switchWebsite(...albumOpen, "hidden-items");
    const before = await everythingWritten();

    expect(await endOf(asAlice, moment)).toEqual({ kind: "refused" });
    expect(await everythingWritten()).toEqual(before);
  }, 60_000);
});

describe("LP22 LP26: an item the member turned is never New at a later visit", () => {
  waitsOn(withTheAlbum, "ending a moment that read only what was decided while the visit before played answers a last visit at the sticker that visit turned, while the stored last visit stays where the moment read", async () => {
    await thanks(alice, carol);
    const asAlice = await aReturningMember(alice);
    await thanks(bob, alice);
    const before = await theMomentOf(asAlice);
    const whilePlaying = await thanks(bob, alice);
    await endOf(asAlice, before);
    await laterTurnTheSticker(asAlice, carol);
    later();

    const moment = await theMomentOf(asAlice);
    const ended = await endOf(asAlice, moment);

    expect(moment.excerpts.map(({ entry }) => entry.at), "what was decided while the visit before played").toEqual([whilePlaying.at]);
    expect(ended).toEqual({ kind: "arrived", lastVisit: await stickerPutInAt(asAlice, carol) });
    expect((await albumOf(asAlice)).lastVisit).toBe(moment.until);
  }, 60_000);

  waitsOn(withTheAlbum, "an arrival held short by a kudos whose XP waits answers a last visit at the sticker the visit before turned, and the kudos still plays once its XP records", async () => {
    await thanks(alice, carol);
    await thanks(bob, alice);
    const asAlice = await aReturningMember(alice);
    await laterTurnTheSticker(asAlice, carol);
    const waiting = await thanksWhileItsXpWaits(bob, alice);
    const read = await momentOf(asAlice);
    expect(read).toMatchObject({ kind: "none" });

    const arrived = await arrive(asAlice, (read as { lastVisit: number }).lastVisit);

    expect(arrived).toEqual({ kind: "arrived", lastVisit: await stickerPutInAt(asAlice, carol) });
    await waiting.record();
    expect((await theMomentOf(asAlice)).excerpts.map(({ entry }) => entry.at), "the next read").toEqual([waiting.at]);
  }, 60_000);
});

describe("website reads pass one guard", () => {
  waitsOn(["S15"], "WS61: getXpMoment answers closed with the website off, and signed-out without a session", async () => {
    const asAlice = await aSession(alice);
    expect(await websiteAs(t, null).read("website.xpMoment.getXpMoment", {})).toEqual({ kind: "signed-out" });
    await websiteOff(...everyFlagOfTheMoment);
    expect(await asAlice.read("website.xpMoment.getXpMoment", {})).toEqual({ kind: "closed" });
  }, 60_000);
});

describe("website commands pass one guard", () => {
  waitsOn(["S15"], "WS61: ending answers closed with the website off and signed-out without a session, writing nothing at all", async () => {
    const asAlice = await aSession(alice);
    const ending = { from: 1, until: 2, skipped: false };
    const before = await everythingWritten();

    expect(await websiteAs(t, null).command("website.xpMoment.endXpMoment", ending)).toEqual({ kind: "signed-out" });
    await websiteOff(...everyFlagOfTheMoment);
    const closed = await everythingWritten();
    expect(await asAlice.command("website.xpMoment.endXpMoment", ending)).toEqual({ kind: "closed" });
    expect(await everythingWritten()).toEqual(closed);
    expect(closed.tables.lastVisits).toEqual(before.tables.lastVisits);
  }, 60_000);

  test("WS61: the moment's instants are the only arguments, so no call names a member", async () => {
    const asAlice = await aSession(alice);

    await expect(asAlice.command("website.xpMoment.endXpMoment", { from: 1, until: 2, skipped: false, member: "someone" })).rejects.toThrow(argumentsRefused);
  }, 60_000);
});

describe("LP72: the XP moment carries the first-thanks top-up", () => {
  waitsOn(momentAndGiving, "a returning member's first kudos shows in its excerpt with the top-up's XP, and the climb starts from before that kudos and crosses level 2", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "onboarding");
    const asAlice = await aReturningMember(alice);

    await thanks(alice, carol);

    const moment = await theMomentOf(asAlice);
    expect(moment.excerpts.map(({ entry, xp }) => [entry.kind, xp]), "the excerpts with their XP").toEqual([
      ["kudosGiven", 15],
      ["levelUp", 0],
    ]);
    expect(moment.xp, "the orb's total").toBe(15);
    expect([moment.climb.from, moment.climb.to].map(({ level, xp }) => [level, xp]), "the climb").toEqual([
      [1, 5],
      [2, 20],
    ]);
  }, 60_000);

  waitsOn(momentAndGiving, "a member who thanked before they ever visited plays the moment from the instant before that kudos at their first visit, then ends it as any moment", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "onboarding");
    await thanks(bob, alice);
    const { at } = await thanks(alice, carol);
    const asAlice = await signedIn(alice);

    const moment = await theMomentOf(asAlice);

    expect(moment.excerpts.map(({ entry, xp }) => [entry.kind, xp]), "the excerpts with their XP").toEqual([
      ["kudosGiven", 15],
      ["levelUp", 0],
    ]);
    expect(moment.excerpts[0]!.entry.at, "the first kudos' excerpt").toBe(at);
    expect([moment.climb.from, moment.climb.to].map(({ level, xp }) => [level, xp]), "the climb").toEqual([
      [1, 5],
      [2, 20],
    ]);
    expect(await endOf(asAlice, moment), "the moment's end").toMatchObject({ kind: "arrived", lastVisit: moment.until });
    expect(await momentOf(asAlice), "the next read").toEqual({ kind: "none", lastVisit: moment.until });
  }, 60_000);

  for (const [when, landsBeforeArrival] of [
    ["before", false],
    ["after", true],
  ] as const) {
    waitsOn(momentAndGiving, `a newcomer's first arrival read while their first kudos' XP waits holds ${when} the top-up lands, so the moment still plays`, async () => {
      await switchWebsite(...everyFlagOfTheMoment, "onboarding");
      const asAlice = await signedIn(alice);
      const held = await thanksWhileItsXpWaits(alice, carol);
      expect(await momentOf(asAlice), "the first read").toEqual({ kind: "none", lastVisit: null });

      if (landsBeforeArrival) await held.record();
      await arrive(asAlice, null);
      if (!landsBeforeArrival) await held.record();

      expect((await theMomentOf(asAlice)).excerpts.map(({ entry, xp }) => [entry.kind, xp]), "the excerpts with their XP").toEqual([
        ["kudosGiven", 20],
        ["levelUp", 0],
      ]);
    }, 60_000);
  }

  waitsOn(momentAndGiving, "a newcomer whose first kudos' XP never records stops holding their first arrival once the moment stops waiting for it", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "onboarding");
    const asAlice = await signedIn(alice);
    await thanksWhileItsXpWaits(alice, carol);
    t.time.advance(11 * minuteMs);

    await arrive(asAlice, null);

    expect(await momentOf(asAlice), "the next read").toMatchObject({ kind: "none", lastVisit: await newestKudosDecidedFor(carol) });
  }, 60_000);

  waitsOn(momentAndGiving, "a newcomer who has only received kudos arrives past them at their first visit, as before", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "onboarding");
    const asAlice = await signedIn(alice);
    await thanks(bob, alice);

    await arrive(asAlice, null);

    expect(await momentOf(asAlice), "the next read").toMatchObject({ kind: "none", lastVisit: await newestKudosDecidedFor(alice) });
  }, 60_000);

  waitsOn(momentAndGiving, "a later kudos plays at its own XP, without the top-up", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "onboarding");
    const asAlice = await signedIn(alice);
    await thanks(alice, carol);
    const first = await theMomentOf(asAlice);
    await endOf(asAlice, first);
    later();

    await thanks(alice, bob);

    expect((await theMomentOf(asAlice)).excerpts.map(({ entry, xp }) => [entry.kind, xp]), "the excerpts with their XP").toEqual([["kudosGiven", 10]]);
  }, 60_000);

  waitsOn(momentAndGiving, "while onboarding is off, a first kudos plays at its 10 XP and a member with no last visit reads none, as before", async () => {
    const asAlice = await aReturningMember(alice);
    await thanks(alice, carol);
    const asCarol = await signedIn(carol);
    await thanks(carol, bob);

    expect((await theMomentOf(asAlice)).excerpts.map(({ entry, xp }) => [entry.kind, xp]), "the returning member's excerpts").toEqual([["kudosGiven", 10]]);
    expect(await momentOf(asCarol), "the member with no last visit").toEqual({ kind: "none", lastVisit: null });
  }, 60_000);
});

describe("LP104: a quest finished since the last visit gets its own beat", () => {
  const onTheMondayPath = [...everyFlagOfTheMoment, "monday-quest"];

  waitsOn(withTheAlbum, "answers each quest finished since the last visit, oldest first, and climbs from before its XP, counting it once", async () => {
    await switchWebsite(...onTheMondayPath, "quest-beats");
    const asAlice = await aReturningMember(alice);

    await thanks(alice, carol);
    await thanks(alice, bob);

    const moment = await theMomentOf(asAlice);
    expect(moment.quests, "the quests finished").toEqual([
      { kind: "journey", goal: "Give a kudos to someone", xp: 50, hoggie: true },
      { kind: "journey", goal: "Thank someone new", xp: 50, hoggie: true },
    ]);
    expect(moment.climb.to, "the climb's end").toEqual((await albumOf(asAlice)).level);
    expect(moment.climb.to.xp - moment.climb.from.xp, "the climb").toBe(moment.xp + 100);
  }, 60_000);

  waitsOn(momentAndGiving, "a quest finished by a kudos folded out of the excerpts still gets its beat", async () => {
    await switchWebsite(...onTheMondayPath, "quest-beats");
    const asAlice = await aReturningMember(alice);
    await thanks(alice, carol);

    for (let kudos = 0; kudos < 6; kudos += 1) await thanks(kudos % 2 === 0 ? bob : carol, alice);

    const moment = await theMomentOf(asAlice);
    expect(moment.excerpts.map(({ entry }) => entry.kind), "the excerpts").not.toContain("kudosGiven");
    expect(moment.quests.map(({ goal }) => goal), "the quests finished").toEqual(["Give a kudos to someone"]);
  }, 60_000);

  waitsOn(momentAndGiving, "a kudos whose quests aren't judged yet waits out of the moment, and plays its quest's beat once they are", async () => {
    await switchWebsite(...onTheMondayPath, "quest-beats");
    const asAlice = await aReturningMember(alice);
    const before = await thanks(bob, alice);
    const held = await thanksWhileHeldBack(followingQuests, alice, carol);

    const moment = await theMomentOf(asAlice);
    expect(moment.excerpts.map(({ entry }) => entry.at), "the moment while the quests wait").toEqual([before.at]);
    expect(moment.quests, "the quests while they wait").toEqual([]);
    await endOf(asAlice, moment);
    await held.record();

    const next = await theMomentOf(asAlice);
    expect(next.quests.map(({ goal }) => goal), "the next moment's quests").toEqual(["Give a kudos to someone"]);
    expect(next.climb.to.xp - next.climb.from.xp, "the next moment's climb").toBe(next.xp + 50);
  }, 60_000);

  waitsOn(withTheAlbum, "a first thanks whose quests aren't judged yet waits out of the moment with its top-up, so the moment climbs only by what it plays", async () => {
    await switchWebsite(...onTheMondayPath, "onboarding", "quest-beats");
    const asAlice = await signedIn(alice);
    const member = await memberOf(alice);
    await t.run((ctx) => moveLastVisitTo(ctx, member, t.clock.now()));
    const atTheVisit = (await albumOf(asAlice)).level.xp;
    await thanks(bob, alice);
    await thanksWhileHeldBack(followingQuests, alice, carol);

    const moment = await theMomentOf(asAlice);
    expect(moment.excerpts.map(({ entry, xp }) => [entry.kind, xp]), "the moment while the quests wait").toEqual([["kudosReceived", 5]]);
    expect([moment.climb.from.xp, moment.climb.to.xp], "the climb").toEqual([atTheVisit, atTheVisit + 5]);
  }, 60_000);

  waitsOn(momentAndGiving, "while quest-beats is off the moment answers no quest and climbs as before", async () => {
    await switchWebsite(...onTheMondayPath);
    const asAlice = await aReturningMember(alice);

    await thanks(alice, carol);

    const moment = await theMomentOf(asAlice);
    expect(moment.quests, "the quests finished").toEqual([]);
    expect(moment.climb.to.xp - moment.climb.from.xp, "the climb").toBe(moment.xp);
  }, 60_000);
});

describe("LP107: a quest or milestone that progressed since the last visit gets its own beat", () => {
  const onTheMondayPath = [...everyFlagOfTheMoment, "monday-quest"];

  waitsOn(withTheWeek, "answers each drawn quest that moved without finishing, from where it stood at the last visit to now", async () => {
    await switchWebsite(...onTheMondayPath, "progress-beats");
    await aWeekDrawnAsTheJourneyEnds(alice);
    await arrive(await signedIn(alice), null);
    const atTheVisit = await weekOf(alice);

    await thanks(alice, bob);
    const asAlice = await signedIn(alice);

    const now = await weekOf(alice);
    const moved = now.slots.flatMap((slot, index) => {
      const from = atTheVisit.slots[index]!.progress;
      return slot.progress > from && slot.finishedAt === null ? [{ kind: "quest", name: slot.goal.replace(/\.$/, ""), from, to: slot.progress, of: slot.target }] : [];
    });
    expect(moved, "the drawn quests that moved without finishing").not.toEqual([]);
    expect((await theMomentOf(asAlice)).progressed.filter(({ kind }) => kind === "quest")).toEqual(moved);
  }, 60_000);

  waitsOn(withTheWeek, "a kudos whose quests aren't judged yet waits out of the moment, and its drawn quests move from the last visit once they are", async () => {
    await switchWebsite(...onTheMondayPath, "progress-beats");
    await aWeekDrawnAsTheJourneyEnds(alice);
    await arrive(await signedIn(alice), null);
    const atTheVisit = await weekOf(alice);
    const held = await thanksWhileHeldBack(followingQuests, alice, bob);
    const asAlice = await signedIn(alice);

    expect(await momentOf(asAlice), "the moment while the quests wait").toMatchObject({ kind: "none" });
    await held.record();

    const now = await weekOf(alice);
    const moved = now.slots.flatMap((slot, index) => {
      const from = atTheVisit.slots[index]!.progress;
      return slot.progress > from && slot.finishedAt === null ? [{ kind: "quest", name: slot.goal.replace(/\.$/, ""), from, to: slot.progress, of: slot.target }] : [];
    });
    expect(moved, "the drawn quests that moved without finishing").not.toEqual([]);
    expect((await theMomentOf(asAlice)).progressed.filter(({ kind }) => kind === "quest"), "the next moment's drawn quests").toEqual(moved);
  }, 60_000);

  waitsOn(momentAndGiving, "answers the kudos milestone moving toward its next tier by the kudos given since the last visit", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "progress-beats");
    await thanks(alice, bob);
    const asAlice = await aReturningMember(alice);

    await thanks(alice, carol);
    await thanks(alice, bob, carol);

    expect((await theMomentOf(asAlice)).progressed).toEqual([{ kind: "milestone", name: "Generous soul", from: 1, to: 4, of: 25 }]);
  }, 60_000);

  waitsOn(momentAndGiving, "HH9: a short kudos given since the last visit moves the kudos milestone", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "progress-beats");
    await thanks(alice, bob);
    const asAlice = await aReturningMember(alice);
    later();

    await kudosSentAt(t.clock.now(), "ty", alice, carol);

    expect((await theMomentOf(asAlice)).progressed).toEqual([{ kind: "milestone", name: "Generous soul", from: 1, to: 2, of: 25 }]);
  }, 60_000);

  waitsOn(momentAndGiving, "HH9: the kudos milestone moves by what its count took in: a thoughtful kudos tallied before HH9, not a short one, and a short kudos since", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "progress-beats");
    await thanks(alice, bob);
    const asAlice = await aReturningMember(alice);
    await thanks(alice, carol);
    await asTalliedBeforeHH9(alice, { counted: true });
    later();
    await kudosSentAt(t.clock.now(), "ty", alice, bob);
    await asTalliedBeforeHH9(alice, { counted: false });
    later();

    await kudosSentAt(t.clock.now(), "ty", alice, carol);

    expect((await theMomentOf(asAlice)).progressed).toEqual([{ kind: "milestone", name: "Generous soul", from: 1, to: 3, of: 25 }]);
  }, 60_000);

  waitsOn(withTheWeek, "a kudos sent before the last visit and decided after it moves the drawn quests and the milestone since the visit", async () => {
    await switchWebsite(...onTheMondayPath, "progress-beats");
    await aWeekDrawnAsTheJourneyEnds(alice);
    await signedIn(alice);
    later();
    const sentBeforeTheVisit = t.clock.now();
    const asAlice = await aReturningMember(alice);
    const atTheVisit = await weekOf(alice);

    await thanksSentAt(sentBeforeTheVisit, alice, carol);

    const now = await weekOf(alice);
    const drawnMoved = now.slots.flatMap((slot, index) => {
      const from = atTheVisit.slots[index]!.progress;
      return slot.progress > from && slot.finishedAt === null ? [{ kind: "quest", name: slot.goal.replace(/\.$/, ""), from, to: slot.progress, of: slot.target }] : [];
    });
    expect(drawnMoved, "the drawn quests that moved without finishing").not.toEqual([]);
    expect((await theMomentOf(asAlice)).progressed).toEqual([...drawnMoved, { kind: "milestone", name: "Generous soul", from: 3, to: 4, of: 25 }]);
  }, 60_000);

  waitsOn(momentAndGiving, "MQ46: a kudos that doesn't say why, sent before the last visit and decided after it, moves the two-days quest since the visit", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "progress-beats");
    const member = await memberOf(alice);
    await t.run((ctx) => startQuests(ctx, member, t.clock.now()));
    later();
    const sentBeforeTheVisit = t.clock.now();
    const asAlice = await aReturningMember(alice);

    await kudosSentAt(sentBeforeTheVisit, "thanks", alice, carol);

    expect((await theMomentOf(asAlice)).progressed.filter(({ kind }) => kind === "quest")).toEqual([{ kind: "quest", name: onboardingGoalOf("two-days"), from: 0, to: 1, of: 2 }]);
  }, 60_000);

  waitsOn(withTheWeek, "a kudos on last week's draw moves no quest once a new week has begun", async () => {
    await switchWebsite(...onTheMondayPath, "progress-beats");
    await aWeekDrawnAsTheJourneyEnds(alice);
    await arrive(await signedIn(alice), null);
    const atTheVisit = await weekOf(alice);
    setTime(new Date("2026-10-17T10:00:00Z"));
    await thanks(alice, bob);
    const lastWeek = await weekOf(alice);
    expect(lastWeek.slots.some((slot, index) => slot.progress > atTheVisit.slots[index]!.progress && slot.finishedAt === null), "a drawn quest moved on Saturday").toBe(true);

    setTime(new Date("2026-10-19T10:00:00Z"));
    const asAlice = await signedIn(alice);

    expect((await theMomentOf(asAlice)).progressed.filter(({ kind }) => kind === "quest")).toEqual([]);
  }, 60_000);

  waitsOn(momentAndGiving, "a kudos whose tally waits stays out of the moment, and the milestone moves from where it stood once it is tallied", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "progress-beats");
    await thanks(alice, bob);
    const asAlice = await aReturningMember(alice);
    const held = await thanksWhileHeldBack(tallying, alice, carol);

    expect(await momentOf(asAlice), "the moment while the tally waits").toMatchObject({ kind: "none" });
    await held.record();
    const first = await theMomentOf(asAlice);
    expect(first.progressed, "the first moment").toEqual([{ kind: "milestone", name: "Generous soul", from: 1, to: 2, of: 25 }]);
    await endOf(asAlice, first);
    await thanks(alice, bob);

    expect((await theMomentOf(asAlice)).progressed, "the next moment").toEqual([{ kind: "milestone", name: "Generous soul", from: 2, to: 3, of: 25 }]);
  }, 60_000);

  waitsOn(momentAndGiving, "a kudos whose tally never runs moves the milestone in no moment, once the moment stops waiting on it", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "progress-beats");
    await thanks(alice, bob);
    const asAlice = await aReturningMember(alice);
    await thanksWhileHeldBack(tallying, alice, carol);
    t.time.advance(11 * minuteMs);

    const first = await theMomentOf(asAlice);
    expect(first.progressed, "the moment that plays the untallied kudos").toEqual([]);
    await endOf(asAlice, first);
    await thanks(alice, bob);

    expect((await theMomentOf(asAlice)).progressed, "the next moment").toEqual([{ kind: "milestone", name: "Generous soul", from: 1, to: 2, of: 25 }]);
  }, 60_000);

  waitsOn(momentAndGiving, "the two-days quest moves by the kudos the moment plays while a later kudos that finishes it waits on its XP", async () => {
    await switchWebsite(...onTheMondayPath, "progress-beats");
    const member = await memberOf(alice);
    await t.run((ctx) => startQuests(ctx, member, t.clock.now()));
    await aReturningMember(alice);
    await thanks(alice, carol);
    t.time.advance(dayMs);

    await thanksWhileItsXpWaits(alice, bob);

    expect((await theMomentOf(await signedIn(alice))).progressed.filter(({ name }) => name === onboardingGoalOf("two-days"))).toEqual([{ kind: "quest", name: onboardingGoalOf("two-days"), from: 0, to: 1, of: 2 }]);
  }, 60_000);

  waitsOn(momentAndGiving, "the two-days quest moves by the kudos the moment plays while a later kudos, sent on another day before the last visit, finishes it and waits on its XP", async () => {
    await switchWebsite(...onTheMondayPath, "progress-beats");
    const member = await memberOf(alice);
    await t.run((ctx) => startQuests(ctx, member, t.clock.now()));
    later();
    const sentOnTheFirstDay = t.clock.now();
    t.time.advance(dayMs);
    const sentOnTheSecondDay = t.clock.now();
    await aReturningMember(alice);

    await thanksSentAt(sentOnTheFirstDay, alice, carol);
    await thanksSentWhileHeldBack(sentOnTheSecondDay, recordingXp, alice, bob);

    expect((await theMomentOf(await signedIn(alice))).progressed.filter(({ name }) => name === onboardingGoalOf("two-days"))).toEqual([{ kind: "quest", name: onboardingGoalOf("two-days"), from: 0, to: 1, of: 2 }]);
  }, 60_000);

  waitsOn(momentAndGiving, "past 50 awards given since the last visit the moment answers no milestone or two-days progress, and still plays", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "progress-beats");
    const member = await memberOf(alice);
    await t.run((ctx) => startQuests(ctx, member, t.clock.now()));
    await aReturningMember(alice);
    for (let given = 0; given < 26; given += 1) await thanks(alice, bob, carol);

    const moment = await theMomentOf(await signedIn(alice));

    expect(moment.moments, "the kudos the moment plays").toBe(26);
    expect(moment.progressed).toEqual([]);
  }, 60_000);

  waitsOn(momentAndGiving, "50 awards given since the two-days quest started still move it, whatever was given the day before it started", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "progress-beats");
    await thanks(alice, bob);
    const member = await memberOf(alice);
    later();
    await t.run((ctx) => startQuests(ctx, member, t.clock.now()));
    await aReturningMember(alice);
    for (let given = 0; given < 25; given += 1) await thanks(alice, bob, carol);

    const progressed = (await theMomentOf(await signedIn(alice))).progressed;

    expect(progressed.filter(({ name }) => name === onboardingGoalOf("two-days"))).toEqual([{ kind: "quest", name: onboardingGoalOf("two-days"), from: 0, to: 1, of: 2 }]);
  }, 60_000);

  waitsOn(withTheWeek, "a drawn quest with more than 50 counted kudos this week answers no progress", async () => {
    await switchWebsite(...onTheMondayPath, "progress-beats");
    await aWeekDrawnAsTheJourneyEnds(alice);
    await arrive(await signedIn(alice), null);
    const atTheVisit = await weekOf(alice);
    await thanks(alice, bob);
    const now = await weekOf(alice);
    const movedIndex = now.slots.findIndex((slot, index) => slot.progress > atTheVisit.slots[index]!.progress && slot.finishedAt === null);
    const moved = now.slots[movedIndex]!;
    const member = await memberOf(alice);
    const rows = (await t.seed.all("questProgress")).filter((row) => row.member === member && row.week === now.week && row.slot === moved.slot);
    const { _id, _creationTime, ...newest } = rows.at(-1)!;
    for (let copy = 0; copy < 51; copy += 1) await t.seed.insert("questProgress", newest);

    const progressed = (await theMomentOf(await signedIn(alice))).progressed;

    expect(progressed.map(({ name }) => name)).not.toContain(moved.goal.replace(/\.$/, ""));
  }, 60_000);

  waitsOn(momentAndGiving, "a kudos to two teammates that ends a moment without a level moves the milestone once, and the next moment moves on from it", async () => {
    await switchWebsite(...everyFlagOfTheMoment, "progress-beats");
    await thanks(alice, bob);
    await thanks(alice, carol);
    await thanks(alice, bob);
    const asAlice = await aReturningMember(alice);
    await thanks(alice, bob, carol);
    const first = await theMomentOf(asAlice);
    expect(first.progressed, "the first moment").toEqual([{ kind: "milestone", name: "Generous soul", from: 3, to: 5, of: 25 }]);
    await endOf(asAlice, first);

    await thanks(alice, bob);

    expect((await theMomentOf(asAlice)).progressed, "the next moment").toEqual([{ kind: "milestone", name: "Generous soul", from: 5, to: 6, of: 25 }]);
  }, 60_000);

  waitsOn(momentAndGiving, "while progress-beats is off the moment answers no progress", async () => {
    await switchWebsite(...everyFlagOfTheMoment);
    await thanks(alice, bob);
    const asAlice = await aReturningMember(alice);

    await thanks(alice, carol);

    expect((await theMomentOf(asAlice)).progressed).toEqual([]);
  }, 60_000);
});

// S16's turn command, which has no route yet: website commands get no module-map stubs, so until S16 registers
// `website.album.turnItem` a turn ends here, as at its stub.
async function turnItem(_ctx: MutationContext, _me: VerifiedMember, _person: HomeMember, _args: { item: string }): Promise<TurnAnswer> {
  throw notPorted("website.album.turnItem");
}

// Today's `switchWebsite(t, postHog, true, ...flags)`: the website open, these flags on for everyone, and the workspace's key made.
async function switchWebsite(...flags: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

// Today's `switchWebsite(t, postHog, false, ...flags)`: the website off, these flags on, and the workspace's key made.
async function websiteOff(...flags: string[]) {
  await definitionsStored(t.operations, offForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

/** Today's `aSignedInSession`: the person signs in, through SSO here, and the website's requests come as them. */
function aSession(someone: Person) {
  return signedInThroughSso(t, someone);
}

function person(first: string, last: string): Person {
  return { user: `U_${first}_${last}`.toUpperCase(), name: `${first} ${last}` };
}

// Today's `vi.setSystemTime(Date.now() + minuteMs)`.
function later() {
  t.time.advance(minuteMs);
}

// Today's `vi.setSystemTime(at)`, which here only moves the app's clock forward.
function setTime(at: Date) {
  t.time.advance(at.getTime() - t.clock.now());
}

// The front door acknowledges an event no domain registered a handler for and takes nothing in, so a kudos, a hug or a
// deletion sent before the stack that handles it lands would go nowhere: until then it ends here, as at a stub.
function handledByTheFrontDoor(kind: "message" | "reactionAdded") {
  if (!Object.hasOwn(serviceRegistry.slack.events ?? {}, kind)) throw notPorted(`slack.events.${kind}`);
}

// The front door answers 500 when a registered handler fails, and the test would go on as if the event did nothing. A
// failure that reached a stub still waits, as at the stub; any other answer but 200 fails the test as itself.
async function delivered(response: Response | Promise<Response>): Promise<void> {
  const { status } = await response;
  if (status === 200) return;
  const failure = t.logs.findLast(({ message }) => message === "slack request failed");
  if (failure?.fields.error === "NotPortedError") throw notPorted("slack.frontDoor.handler");
  throw new Error(`The front door answered ${status}`);
}

/**
 * Runs every job, moving the app's clock to each next one, as today's `settle` ran every scheduled function under fake
 * timers: within an hour, the longest a delivery waits for its next try.
 */
async function settle() {
  const until = t.clock.now() + hourMs;
  for (;;) {
    await t.settle();
    const [next] = await t.query(({ tx }) => tx.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt), asc(jobs._id)).limit(1));
    if (next === undefined || next.runAt > until || next.runAt <= t.clock.now()) break;
    t.time.advance(next.runAt - t.clock.now());
  }
}

async function thanks(giver: Person, ...recipients: Person[]) {
  later();
  return thanksSentAt(t.clock.now(), giver, ...recipients);
}

async function thanksSentAt(at: number, giver: Person, ...recipients: Person[]) {
  return kudosSentAt(at, why, giver, ...recipients);
}

async function asTalliedBeforeHH9(giver: Person, { counted }: { counted: boolean }) {
  const newest = (await t.seed.all("talliedAwards")).at(-1)!;
  await t.seed.patch("talliedAwards", newest._id, { everyKudos: undefined });
  if (counted) return;
  const member = await memberOf(giver);
  const [week] = await t.query(({ tx }) => tx.select({ _id: weekTallies._id, thoughtfulGiven: weekTallies.thoughtfulGiven }).from(weekTallies).where(eq(weekTallies.member, member)).orderBy(desc(weekTallies.week), desc(weekTallies._creationTime), desc(weekTallies._id)).limit(1));
  await t.seed.patch("weekTallies", week!._id, { thoughtfulGiven: week!.thoughtfulGiven - 1 });
}

async function kudosSentAt(at: number, words: string, giver: Person, ...recipients: Person[]) {
  handledByTheFrontDoor("message");
  messages += 1;
  const ts = `${Math.floor(at / 1000)}.${String(messages).padStart(6, "0")}`;
  await delivered(t.send("/events", messageEvent([section(text(`${words} `), ...recipients.flatMap(({ user }) => [mention(user), text(" ")]), emoji("taco"))], { user: giver.user, ts })));
  await settle();
  return { at: Number(ts.split(".")[0]) * 1000, ts };
}

function thanksWhileItsXpWaits(giver: Person, ...recipients: Person[]) {
  return thanksWhileHeldBack(recordingXp, giver, ...recipients);
}

function thanksWhileHeldBack(job: MutationJob, giver: Person, ...recipients: Person[]) {
  later();
  return thanksSentWhileHeldBack(t.clock.now(), job, giver, ...recipients);
}

async function thanksSentWhileHeldBack(at: number, job: MutationJob, giver: Person, ...recipients: Person[]) {
  handledByTheFrontDoor("message");
  messages += 1;
  const ts = `${Math.floor(at / 1000)}.${String(messages).padStart(6, "0")}`;
  const heldBack: unknown[] = [];
  holding = { name: job.name, heldBack };
  try {
    await delivered(t.send("/events", messageEvent([section(text(`${why} `), ...recipients.flatMap(({ user }) => [mention(user), text(" ")]), emoji("taco"))], { user: giver.user, ts })));
    await settle();
  } finally {
    holding = null;
  }
  return {
    at: Number(ts.split(".")[0]) * 1000,
    record: async () => {
      for (const args of heldBack) await t.run((ctx) => job.handler(ctx, args));
      await settle();
    },
  };
}

const recordingXp = recordEffectsJob as MutationJob;

const followingQuests = followKudosGivenJob as MutationJob;

const tallying = tallyKudosGivenJob as MutationJob;

function aMessageNow() {
  messages += 1;
  return `${Math.floor(t.clock.now() / 1000)}.${String(messages).padStart(6, "0")}`;
}

async function hug(giver: Person, author: Person, ts: string) {
  handledByTheFrontDoor("reactionAdded");
  later();
  await delivered(t.send("/events", reactionEvent({ user: giver.user, itemUser: author.user, ts, eventTs: `${Math.floor(t.clock.now() / 1000)}.000200`, reaction: "taco" })));
  await settle();
}

async function deleteMessage(options: { user: string; ts: string }) {
  handledByTheFrontDoor("message");
  await delivered(t.send("/events", messageDeletedEvent(options)));
}

async function newestKudosDecidedFor(recipient: Person) {
  const member = await memberOf(recipient);
  const [award] = await t.query(({ tx }) => tx.select({ _creationTime: awards._creationTime }).from(awards).where(eq(awards.recipient, member)).orderBy(desc(awards._creationTime), desc(awards._id)).limit(1));
  return award!._creationTime;
}

async function aReturningMember(someone: Person): Promise<VerifiedMember> {
  const reader = await signedIn(someone);
  await thanks(everyone.find((other) => other !== someone)!, someone);
  expect(await arrive(reader, null)).toMatchObject({ kind: "arrived", lastVisit: expect.any(Number) });
  later();
  return reader;
}

function arrive(reader: VerifiedMember, from: number | null): Promise<ArrivalAnswer> {
  return t.run(async (ctx) => arriveAt(ctx, reader, (await lookup(ctx, reader.workspace, reader.user)) as HomeMember, { from }));
}

function momentOf(reader: VerifiedMember): Promise<XpMomentAnswer> {
  return t.query((ctx) => getXpMoment(ctx, reader));
}

async function theMomentOf(reader: VerifiedMember): Promise<XpMoment> {
  const moment = await momentOf(reader);
  if (moment.kind !== "moment") throw new Error(`expected a moment, got ${JSON.stringify(moment)}`);
  return moment;
}

function end(reader: VerifiedMember, ending: { from: number; until: number; skipped: boolean; played?: { shown: number; folded: number } }): Promise<XpMomentEndReply> {
  return t.run(async (ctx) => endXpMoment(ctx, reader, (await lookup(ctx, reader.workspace, reader.user)) as HomeMember, ending));
}

function endOf(reader: VerifiedMember, { since, until }: Pick<XpMoment, "since" | "until">, { skipped = false } = {}): Promise<XpMomentEndReply> {
  return end(reader, { from: since, until, skipped });
}

function endAsTheWebsiteDoes(reader: VerifiedMember, moment: XpMoment): Promise<XpMomentEndReply> {
  return end(reader, { from: moment.since, until: moment.until, skipped: false, played: { shown: moment.excerpts.length, folded: moment.fold?.count ?? 0 } });
}

async function albumOf(reader: VerifiedMember): Promise<AlbumAnswer> {
  const album: AlbumRead | { kind: string } = await t.query((ctx) => getAlbum(ctx, reader));
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album as AlbumAnswer;
}

async function laterTurnTheSticker(reader: VerifiedMember, of: Person) {
  later();
  const item = await stickerItemOf(alice, of);
  const turned = await t.run(async (ctx) => turnItem(ctx, reader, (await lookup(ctx, reader.workspace, reader.user)) as HomeMember, { item }));
  if (turned.kind !== "turned") throw new Error(`expected the sticker turned, got ${JSON.stringify(turned)}`);
}

async function stickerPutInAt(reader: VerifiedMember, of: Person) {
  const { people } = await albumOf(reader);
  return people.find(({ name }) => name === of.name)!.at;
}

async function stickerItemOf(giver: Person, thanked: Person): Promise<string> {
  const [member, person] = [await memberOf(giver), await memberOf(thanked)];
  const items = (await t.seed.all("items")).filter((row) => row.member === member);
  const item = items.find((row) => row.source === "sticker" && row.reason.kind === "thanks" && row.reason.person === person);
  if (item === undefined) throw new Error(`no sticker item for thanking ${thanked.name}`);
  return item._id;
}

async function aWeekDrawnAsTheJourneyEnds(someone: Person) {
  await thanks(someone, bob);
  await thanks(someone, carol);
  t.time.advance(dayMs);
  await thanks(someone, bob);
  const member = await memberOf(someone);
  await t.run((ctx) => drawNewWeek(ctx, { member }));
}

async function weekOf(someone: Person) {
  const member = await memberOf(someone);
  const week = await t.query((ctx) => weeklyQuestsOf(ctx, member, t.clock.now()));
  if (week === null) throw new Error("no week drawn");
  return week;
}

async function memberOf(someone: Person): Promise<MemberId> {
  const rows = (await t.seed.all("members")).filter((member) => member.workspace === "T1" && member.user === someone.user);
  if (rows.length > 1) throw new Error(`${rows.length} members rows for ${someone.name}, where one is unique`);
  return rows[0]!._id as MemberId;
}

// A reader signed in as today's `aSignedInSession` left them: the analytics ID the flags decide them by, and the member
// check's answer. Each command reads the person the directory knows in its own mutation, as the route does.
async function signedIn(someone: Person): Promise<VerifiedMember> {
  const member = await memberOf(someone);
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, workspace: "T1", user: someone.user, name: someone.name };
}

// Every table of the data model, each in creation order, and every job, as today's `everythingWritten` read every table
// of the schema and the scheduled functions.
async function everythingWritten() {
  const tables: Record<string, unknown[]> = {};
  for (const table of dataModelTables) tables[getTableName(table)] = await t.seed.all(getTableName(table) as TableName);
  return { tables, scheduled: await t.query(({ tx }) => tx.select().from(jobs).orderBy(asc(jobs._creationTime), asc(jobs._id))) };
}
