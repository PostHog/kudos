// The card renderer's thread (cardRenderer.ts): draws each card it is sent and answers its PNG, or the error's message.
import { parentPort } from "node:worker_threads";
import { drawnPicture, type CardArt, type CardWords } from "./cardPicture.ts";
import type { DrawnCard } from "./playerCard.ts";

const port = parentPort!;

port.on("message", async ({ card, art, words }: { card: DrawnCard; art: CardArt; words: CardWords }) => {
  try {
    const png = new Uint8Array(await drawnPicture(card, art, words));
    port.postMessage({ png }, [png.buffer]);
  } catch (error) {
    port.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
