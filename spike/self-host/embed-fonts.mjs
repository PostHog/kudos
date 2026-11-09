// Spike only, never merged. Runs in the image build, on the build stage's copy of the repo.
// The card drawing needs three RoundHog fonts, but naming @posthog/brand as an external package makes the
// backend install all of it (about 115 MB of generated art) on every boot. Embed the three fonts as base64 in a
// module instead, and drop the package from convex.json's externalPackages.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url.replace("/spike/self-host/", "/convex/"));
const fontsDir = new URL("./", "file://" + require.resolve("@posthog/brand/fonts"));
const files = { roundHogRegular: "RoundHog.woff2", roundHogSemiBold: "RoundHog-SemiBold.woff2", roundHogBold: "RoundHog-Bold.woff2" };
const lines = Object.entries(files).map(([name, file]) => `export const ${name}Base64 = "${readFileSync(new URL(file, fontsDir)).toString("base64")}";`);
writeFileSync("convex/slack/roundHogFonts.ts", lines.join("\n") + "\n");

const drawing = "convex/slack/cardDrawing.ts";
let source = readFileSync(drawing, "utf8");
source = source.replace(
  'import { roundHogBoldUrl, roundHogRegularUrl, roundHogSemiBoldUrl } from "@posthog/brand/fonts";',
  'import { roundHogBoldBase64, roundHogRegularBase64, roundHogSemiBoldBase64 } from "./roundHogFonts";',
);
source = source.replace("{ url: roundHogRegularUrl, weight: 400 }", "{ base64: roundHogRegularBase64, weight: 400 }");
source = source.replace("{ url: roundHogSemiBoldUrl, weight: 600 }", "{ base64: roundHogSemiBoldBase64, weight: 600 }");
source = source.replace("{ url: roundHogBoldUrl, weight: 700 }", "{ base64: roundHogBoldBase64, weight: 700 }");
source = source.replace("for (const { url, weight } of fontFaces) {", "for (const { base64, weight } of fontFaces) {");
source = source.replace("const woff2 = await readFile(new URL(url));", 'const woff2 = Buffer.from(base64, "base64");');
if (!source.includes("roundHogBoldBase64") || source.includes("readFile(new URL(url))")) throw new Error("cardDrawing.ts no longer matches the spike's font patch");
writeFileSync(drawing, source);

const config = JSON.parse(readFileSync("convex.json", "utf8"));
config.node.externalPackages = config.node.externalPackages.filter((name) => name !== "@posthog/brand");
writeFileSync("convex.json", JSON.stringify(config, null, 2) + "\n");
console.log("embedded", Object.keys(files).length, "fonts; external packages now", config.node.externalPackages.join(", "));
