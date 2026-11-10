// Live views. A mutation that writes a table some website view shows notifies its schema's live channel in its
// transaction, which Postgres delivers only on commit (operations.ts). The process's one listener (jobs/wakeups.ts) then
// invalidates the live feed, which tells every open view to refetch; it does too each time the listener listens again,
// for whatever committed while it did not.

/** The channel that wakes this schema's live views. */
export function liveChannel(schema: string): string {
  return `live.${schema}`;
}

/** What a mutation that wrote a shown table sends just before it commits. */
export const notifyLive = "select pg_notify('live.' || current_schema(), '')";

/** The service's own tables, which no website view shows: a write to them alone wakes no view. */
export const unseenTables: ReadonlySet<string> = new Set([
  "jobs",
  "crons",
  "archive",
  "flagDefinitions",
  "flagRefreshes",
  "replays",
  "loadState",
  "loadChunks",
  "loadCheckpoints",
  "analyticsIds",
  "workspaceKeys",
  "analyticsOutbox",
  "recordedFacts",
  "analyticsDrain",
  "errorSweep",
  "watchedJobs",
  "reportedJobs",
  "flagExposures",
  "slackReceipts",
  "slackRateLimits",
]);

/** `invalidate`: something a view shows may have changed. `end`: the service is stopping, so the view's stream ends. */
export type LiveEvent = "invalidate" | "end";

export interface LiveFeed {
  /** Calls `onEvent` on each event until the answered unfollow is called. */
  follow(onEvent: (event: LiveEvent) => void): () => void;
}

export interface LiveSource extends LiveFeed {
  invalidate(): void;
  /** Ends every view that follows, for good. */
  end(): void;
}

export function createLiveFeed(): LiveSource {
  const followers = new Set<(event: LiveEvent) => void>();
  const tell = (event: LiveEvent) => {
    for (const follower of [...followers]) follower(event);
  };
  return {
    follow(onEvent) {
      followers.add(onEvent);
      return () => void followers.delete(onEvent);
    },
    invalidate: () => tell("invalidate"),
    end() {
      tell("end");
      followers.clear();
    },
  };
}
