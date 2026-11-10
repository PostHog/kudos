// Card pictures render in a worker thread of their own, one at a time. satori's layout is CPU work and Resvg's render is
// synchronous: on the main thread either would hold Slack's acknowledgements and the website for as long as a card draws.
// One at a time keeps one card's pictures and pixels in memory at most, and the thread's heap has a ceiling of its own,
// so a card that would need more ends that thread alone; the next card starts a new one. The thread lives on between
// cards, so its fonts are decoded once, and it never holds the process open while it waits. It loads cardPicture.ts
// alone, which imports nothing of the service's.
import { Worker } from "node:worker_threads";
import type { CardArt, CardWords } from "./cardPicture.ts";
import type { DrawnCard } from "./playerCard.ts";

/**
 * The renderer thread's heap: a card needs a few MiB of it, so the old generation's ceiling only stops a runaway card,
 * and a small young generation keeps V8 from reserving the default's far larger one, which the thread never needs.
 */
const heap = { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 8 };

type Answer = { png: Uint8Array } | { error: string };

let thread: Worker | undefined;
let turns: Promise<unknown> = Promise.resolve();

/** The card's PNG, drawn on the renderer thread after every card asked for before it. */
export function renderedCard(card: DrawnCard, art: CardArt, words: CardWords): Promise<Uint8Array> {
  const turn = turns.then(() => renderOnce(card, art, words));
  turns = turn.catch(() => undefined);
  return turn;
}

function renderOnce(card: DrawnCard, art: CardArt, words: CardWords): Promise<Uint8Array> {
  const worker = (thread ??= started());
  return new Promise((resolve, reject) => {
    const done = () => {
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
      reject(error);
    };
    const stopped = (code: number) => {
      done();
      reject(new Error(`the card renderer stopped with exit code ${code}`));
    };
    worker.on("message", answered);
    worker.on("error", failed);
    worker.on("exit", stopped);
    worker.ref();
    worker.postMessage({ card, art, words });
  });
}

function started(): Worker {
  const worker = new Worker(new URL("./cardRenderer.worker.ts", import.meta.url), { resourceLimits: heap });
  worker.unref();
  worker.once("exit", () => {
    if (thread === worker) thread = undefined;
  });
  return worker;
}
