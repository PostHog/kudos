// The suite's one handle on the app's time. Journeys never sleep for app time: they move the app's clock, run a cron,
// or let the jobs that came due run, through the target's time seam (`KUDOS_TIME_URL`, behind `KUDOS_TEST_SECRET`).
// The same contract holds for every target, so a journey reads the same whichever app it drives.
export interface AppTime {
  /** The app's clock, in ms since the epoch (an advance by 0). */
  now(): Promise<number>;
  /** Moves the app's clock forward by ms (never back). Journeys don't rely on due jobs running, or not, before `settle`. */
  advance(ms: number): Promise<number>;
  /** Runs one cron's job once at the app's clock, then settles. */
  runCron(id: CronId): Promise<number>;
  /** Runs every pending job due by the app's clock until none is due and none is running. */
  settle(): Promise<number>;
}

// Each cron's name: the path of its job in today's app. A rewrite keeps these ids as its cron task names.
export const cronIds = [
  "slack.receipts.deleteExpired",
  "analytics.drain.recover",
  "analytics.drain.cleanUp",
  "slack.directory.recheckStranded",
  "slack.verifyMember.retryStranded",
  "analytics.sweep.sweep",
  "unlocks.sweep.sweep",
  "quests.newWeek.sweep",
  "mondayDm.mondayDm.ensureMondayDms",
  "website.clock.tick",
  "website.abandonedHandshakes.deleteAbandoned",
  "companyProfiles.sync.syncCompanyProfiles",
  "slack.userGroups.syncUserGroups",
  "slack.directory.listSlackMembers",
  "slack.customEmoji.syncCustomEmoji",
  "analytics.person.catchUp",
] as const;

export type CronId = (typeof cronIds)[number];

// One step of the seam, as the request body names it. The answer is `{ now, ran }`: the app's clock after the step, and
// the jobs it ran.
export type TimeStep = { advance: number } | { runCron: CronId } | { settle: true };
export type TimeAnswer = { now: number; ran: string[] };

export const testSecretHeader = "x-hedgehug-test-secret";

export function appTime(url: string, secret: string): AppTime {
  const step = async (body: TimeStep) => {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", [testSecretHeader]: secret }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`the time seam answered ${JSON.stringify(body)} with ${response.status}: ${await response.text()}`);
    return ((await response.json()) as TimeAnswer).now;
  };
  return {
    now: () => step({ advance: 0 }),
    advance: (ms) => step({ advance: ms }),
    runCron: (id) => step({ runCron: id }),
    settle: () => step({ settle: true }),
  };
}

const dayMs = 24 * 60 * 60 * 1000;

// How far the clock must move from `now` to reach the next given weekday (0 is Sunday) at hour:minute UTC.
export function untilNext(now: number, weekday: number, hour: number, minute = 0) {
  const at = new Date(now);
  at.setUTCHours(hour, minute, 0, 0);
  let ms = at.getTime() - now + ((weekday - at.getUTCDay() + 7) % 7) * dayMs;
  if (ms <= 0) ms += 7 * dayMs;
  return ms;
}
