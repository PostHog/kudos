// A stand-in for the card renderer's thread (service/src/slack/cardRenderer.worker.ts), for the renderer's recovery
// tests: a card named "crash" throws outside any handler, one named "stall" is never answered, one named "block" holds
// the thread in a synchronous native call for a second and a half, which no terminate can interrupt, as a stuck Resvg
// render would, and any other card is answered with its name and the thread that drew it, so a test can tell a new
// thread from the old one.
import { execFileSync } from "node:child_process";
import { parentPort, threadId } from "node:worker_threads";

const port = parentPort!;

port.on("message", ({ card }: { card: { name: string } }) => {
  if (card.name === "crash") {
    setImmediate(() => {
      throw new Error("the fixture's renderer crashed");
    });
    return;
  }
  if (card.name === "stall") return;
  if (card.name === "block") {
    execFileSync("sleep", ["1.5"]);
    return;
  }
  port.postMessage({ png: new TextEncoder().encode(`${card.name} on thread ${threadId}`) });
});
