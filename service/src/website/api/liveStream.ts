// A live view's stream of server-sent events: an `invalidate` for each of the live feed's, at most one a second, the
// first at once and one more at the second's end for whatever came meanwhile. A comment every 20 seconds keeps the edge
// from cutting it while idle. It holds nothing of the database's, and ends when the client leaves or the service stops.
import type { LiveFeed } from "../../live.ts";

/** Sent as it comes: no cache or proxy keeps, reshapes or buffers it. */
export const liveStreamHeaders = { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" };

const quietMs = 1_000;
const heartbeatMs = 20_000;
const encoder = new TextEncoder();
const invalidation = encoder.encode("event: invalidate\ndata:\n\n");
const heartbeat = encoder.encode(": still here\n\n");

export function liveStream(live: LiveFeed): ReadableStream<Uint8Array> {
  let stop = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      // Set while the second after an invalidate runs; `missed` says another came meanwhile.
      let quiet: NodeJS.Timeout | undefined;
      let missed = false;
      const invalidate = () => {
        if (quiet) return void (missed = true);
        controller.enqueue(invalidation);
        quiet = setTimeout(() => {
          quiet = undefined;
          if (missed) (missed = false), invalidate();
        }, quietMs);
      };
      const beating = setInterval(() => controller.enqueue(heartbeat), heartbeatMs);
      const unfollow = live.follow((event) => (event === "end" ? (stop(), controller.close()) : invalidate()));
      stop = () => {
        unfollow();
        clearInterval(beating);
        clearTimeout(quiet);
      };
    },
    cancel: () => stop(),
  });
}
