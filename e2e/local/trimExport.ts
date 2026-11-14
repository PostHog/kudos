// Trims the oracle's export for this public repository: the `e2e` job trims it before it uploads the `oracle-export`
// artifact, and the fixture (e2e/rewrite/oracleExport.zip) is that artifact. The export whole, but for the static hosting component's files, the website build, which only Convex serves
// and which S20 drops. Their metadata goes with them, so the loader finds no file missing. The company directory goes
// too: the oracle syncs it from PostHog's public team pages, so its rows name real people, and this repository keeps
// synthetic data only.
//
//   node e2e/local/trimExport.ts <export.zip> [<trimmed.zip>, the fixture by default]
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
  const [source, target = oracleExport] = process.argv.slice(2);
  if (!source) throw new Error("usage: node e2e/local/trimExport.ts <export.zip> [<trimmed.zip>, the fixture by default]");
  const trim = await trimmed(await readFile(source));
  await writeFile(target, trim);
  console.log(`wrote ${target}, ${trim.length} bytes`);
}
