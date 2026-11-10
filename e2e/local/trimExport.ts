// Makes the oracle's export fixture (e2e/rewrite/oracleExport.zip) from the `oracle-export` artifact a green `e2e` run
// keeps: the export whole, but for the static hosting component's files, the website build, which only Convex serves
// and which S20 drops. Their metadata goes with them, so the loader finds no file missing. The company directory goes
// too: the oracle syncs it from PostHog's public team pages, so its rows name real people, and this repository keeps
// synthetic data only.
//
//   node e2e/local/trimExport.ts <the artifact's oracleExport.zip>
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rewriteExport } from "../../service/testing/exportZip.ts";
import { oracleExport } from "./oracleCopy.ts";

const emptied = new Set(["_components/staticHosting/_storage/documents.jsonl", "companyProfiles/documents.jsonl", "companyTeams/documents.jsonl"]);

/** The export without the static hosting component's files or the company directory. */
export function trimmed(archive: Buffer): Promise<Buffer> {
  return rewriteExport(archive, (name, content) => {
    if (emptied.has(name)) return Buffer.alloc(0);
    return name.startsWith("_components/staticHosting/_storage/") ? null : content;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.argv[2];
  if (!source) throw new Error("usage: node e2e/local/trimExport.ts <the artifact's oracleExport.zip>");
  const fixture = await trimmed(await readFile(source));
  await writeFile(oracleExport, fixture);
  console.log(`wrote ${oracleExport}, ${fixture.length} bytes`);
}
