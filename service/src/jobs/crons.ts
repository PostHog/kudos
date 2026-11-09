// Today's convex/crons.ts, with the same schedules: each cron's id is its job's name and the time seam's CronId.

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

/** Daily at a UTC time, or every so many milliseconds from the last run. */
export type Schedule = { daily: { hourUTC: number; minuteUTC: number } } | { everyMs: number };

const minutes = (n: number): Schedule => ({ everyMs: n * 60_000 });
const daily = (hourUTC: number, minuteUTC: number): Schedule => ({ daily: { hourUTC, minuteUTC } });

export const cronSchedules: Record<CronId, Schedule> = {
  "slack.receipts.deleteExpired": daily(3, 0),
  "analytics.drain.recover": minutes(10),
  "analytics.drain.cleanUp": daily(3, 15),
  "slack.directory.recheckStranded": minutes(10),
  "slack.verifyMember.retryStranded": minutes(10),
  "analytics.sweep.sweep": minutes(15),
  "unlocks.sweep.sweep": minutes(60),
  "quests.newWeek.sweep": minutes(60),
  "mondayDm.mondayDm.ensureMondayDms": minutes(60),
  "website.clock.tick": minutes(15),
  "website.abandonedHandshakes.deleteAbandoned": daily(3, 30),
  "companyProfiles.sync.syncCompanyProfiles": daily(4, 0),
  "slack.userGroups.syncUserGroups": daily(4, 15),
  "slack.directory.listSlackMembers": daily(4, 20),
  "slack.customEmoji.syncCustomEmoji": daily(4, 30),
  "analytics.person.catchUp": daily(4, 45),
};

/**
 * Crons whose work only Convex had: they keep their id in the time seam's contract and run nothing. The abandoned
 * sign-in handshakes are Convex Auth's verifiers, which the rewrite archives.
 */
export const retiredCrons: ReadonlySet<CronId> = new Set(["website.abandonedHandshakes.deleteAbandoned"]);

export function isCronId(text: unknown): text is CronId {
  return (cronIds as readonly unknown[]).includes(text);
}

/** The cron's next run strictly after `after`. A run missed while no copy ran is not made up: it fires once. */
export function nextRun(schedule: Schedule, after: number): number {
  if ("everyMs" in schedule) return after + schedule.everyMs;
  const day = 86_400_000;
  const at = Math.floor(after / day) * day + (schedule.daily.hourUTC * 60 + schedule.daily.minuteUTC) * 60_000;
  return at > after ? at : at + day;
}
