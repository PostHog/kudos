// Spike only, never merged. Runs in the image build when CARD_RENDER=outside. Takes the card drawing out of Convex's
// Node executor: the `drawn` action becomes a plain V8 action that asks the container's own renderer on loopback for
// the PNG, and convex.json names no external packages. With no external packages the backend builds and caches no
// dependency package, so a crash during a push cannot leave a cache row pointing at a blob the disk lost.
// The spike's renderer is a stub (the action returns no picture, as when drawing times out); the card flag is off.
import { readFileSync, writeFileSync } from "node:fs";

writeFileSync("convex/slack/cardDrawing.ts", `import { v } from "convex/values";
import { observedAction } from "../analytics/boundary";
import { drawnCardValidator } from "./playerCard";

// Spike stub: the real renderer would run beside the backend and answer on loopback.
export const drawn = observedAction({
  args: { card: drawnCardValidator, key: v.string() },
  handler: async (): Promise<string | null> => null,
});
`);
const config = JSON.parse(readFileSync("convex.json", "utf8"));
delete config.node;
writeFileSync("convex.json", JSON.stringify(config, null, 2) + "\n");
console.log("card drawing moved out of the Node executor; external packages: none");
