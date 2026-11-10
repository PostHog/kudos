// Sending a drain's batch to PostHog: the analytics module's one fetch, outside every transaction, through the app's
// one way out (the image's fetch honours HTTPS_PROXY). Only the registry imports it, so the outbox, and the flag
// module that records through it, never reach the network. Today's sending, from convex/analytics/drain.ts.
import type { Capture } from "./capture.ts";
import { createDrain, type Answer, type OutboxRow, type Send } from "./drain.ts";
import { postHogExceptionList } from "./exceptions.ts";

const answerTimeoutMs = 10_000;
const rejectedStatuses = [400, 413];

/** Posts the batch, each row under its own UUID; PostHog's 2xx delivers it, 400 and 413 reject it, the rest fail it. */
export function sendBatch({ timeoutMs = answerTimeoutMs }: { timeoutMs?: number } = {}): Send {
  return async (capture, batch) => {
    try {
      const response = await fetch(`${capture.host}/batch/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batchBody(capture, batch)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.body?.cancel().catch(() => {});
      return answerTo(response.status);
    } catch {
      return "failed";
    }
  };
}

/** The drain the worker runs. */
export const drainJob = createDrain(sendBatch());

function answerTo(status: number): Answer {
  if (status >= 200 && status < 300) return "delivered";
  return rejectedStatuses.includes(status) ? "rejected" : "failed";
}

function batchBody(capture: Capture, batch: OutboxRow[]) {
  return {
    api_key: capture.token,
    batch: batch.map((row) => ({
      event: row.event,
      distinct_id: row.distinctId,
      uuid: row.uuid,
      timestamp: new Date(row.timestamp).toISOString(),
      properties: {
        ...withPostHogNames(row.properties),
        ...(row.exception && { $exception_list: postHogExceptionList(row.exception) }),
        ...(row.person && { $set: row.person.set }),
        ...(row.person && row.person.unset.length > 0 && { $unset: row.person.unset }),
      },
    })),
  };
}

const postHogNames: Record<string, string> = { feature_flag: "$feature_flag", feature_flag_response: "$feature_flag_response" };

function withPostHogNames(properties: OutboxRow["properties"]) {
  return Object.fromEntries(Object.entries(properties).map(([name, value]) => [postHogNames[name] ?? name, value]));
}
