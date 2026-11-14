// The retirement list: functions Convex could have scheduled that the service runs no job for. Recovery cancels a
// retired row that would still run, on the record, and keeps a finished one as history; any name on neither this list
// nor the job registry stops recovery. Append a name, with its kind, when a stack retires a function instead of
// porting it.
type Kind = "mutation" | "action";

export const retiredJobs: ReadonlyMap<string, Kind> = new Map<string, Kind>([
  // The PostHog component's flag refresh chain; S1's `analytics.flags.refresh` replaces it.
  ["_components/posthog/lib.refreshLoop", "mutation"],
  ["_components/posthog/lib.ensureRefreshLoop", "mutation"],
  ["_components/posthog/lib.refreshFlagDefinitions", "action"],
  // S7's one-off backfill of the quest finishes from the rewards (convex/quests/finishSeed.ts): run by hand page by page,
  // guarded per row and never scheduled by the app, so the service ports no job for it. Keyed as recovery names it.
  ["quests.finishSeed.seedQuestFinishes", "mutation"],
]);
