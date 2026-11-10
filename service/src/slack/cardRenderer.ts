// Card pictures render in a worker thread of their own, one at a time. satori's layout is CPU work and Resvg's render is
// synchronous: on the main thread either would hold Slack's acknowledgements and the website for as long as a card draws.
// One at a time keeps one card's pictures and pixels in memory at most. The thread's JS heap has a ceiling of its own;
// the art it is sent is bounded before it leaves the main thread (cardDrawing.ts), since decoded images live outside
// that heap. A thread that crashes, errs or misses a render's deadline is ended and dropped before the next card goes,
// and the next card starts a new one. The thread lives on between cards, so its fonts are decoded once, and it never
// holds the process open while it waits. It loads cardPicture.ts alone, which imports nothing of the service's.
import { Worker } from "node:worker_threads";
import type { CardArt, CardWords } from "./cardPicture.ts";
import type { DrawnCard } from "./playerCard.ts";

/**
 * The renderer thread's heap: a card needs a few MiB of it, so the old generation's ceiling only stops a runaway card,
 * and a small young generation keeps V8 from reserving the default's far larger one, which the thread never needs.
 */
const heap = { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 8 };

/** A card draws in well under a second; one that takes this long is stuck, and holds every card queued behind it. */
const renderDeadlineMs = 30_000;

type Answer = { png: Uint8Array } | { error: string };

export type RenderCard = (card: DrawnCard, art: CardArt, words: CardWords) => Promise<Uint8Array>;

/** A renderer: one thread running `script`, drawing the cards it is asked for in order, each within `deadlineMs`. */
export function cardRenderer(script: URL, { deadlineMs }: { deadlineMs: number }): RenderCard {
  let thread: Worker | undefined;
  let turns: Promise<unknown> = Promise.resolve();

  const retired = (worker: Worker) => {
    if (thread === worker) thread = undefined;
    void worker.terminate();
  };

  const started = () => {
    const worker = new Worker(script, { resourceLimits: heap });
    worker.unref();
    worker.once("exit", () => {
      if (thread === worker) thread = undefined;
    });
    return worker;
  };

  const renderOnce = (card: DrawnCard, art: CardArt, words: CardWords) => {
    const worker = (thread ??= started());
    return new Promise<Uint8Array>((resolve, reject) => {
      const done = () => {
        clearTimeout(late);
        worker.off("message", answered);
        worker.off("error", failed);
        worker.off("exit", stopped);
        worker.unref();
      };
      const answered = (answer: Answer) => {
        done();
        if ("png" in answer) resolve(answer.png);
        else reject(new Error(`the card renderer failed: ${answer.error}`));
      };
      const failed = (error: Error) => {
        done();
        retired(worker);
        reject(error);
      };
      const stopped = (code: number) => {
        done();
        retired(worker);
        reject(new Error(`the card renderer stopped with exit code ${code}`));
      };
      const late = setTimeout(() => {
        done();
        retired(worker);
        reject(new Error(`the card renderer missed its ${deadlineMs} ms deadline`));
      }, deadlineMs);
      worker.on("message", answered);
      worker.on("error", failed);
      worker.on("exit", stopped);
      worker.ref();
      worker.postMessage({ card, art, words });
    });
  };

  return (card, art, words) => {
    const turn = turns.then(() => renderOnce(card, art, words));
    turns = turn.catch(() => undefined);
    return turn;
  };
}

/** The card's PNG, drawn on the service's renderer thread after every card asked for before it. */
export const renderedCard: RenderCard = cardRenderer(new URL("./cardRenderer.worker.ts", import.meta.url), { deadlineMs: renderDeadlineMs });
