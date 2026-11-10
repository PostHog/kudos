// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { entriesOf } from "../../service/testing/exportZip.ts";
import { zip } from "../../service/testing/zip.ts";
import { oracleExport } from "./oracleCopy.ts";
import { trimmed } from "./trimExport.ts";

async function unzipped(archive: Buffer): Promise<Record<string, string>> {
  return Object.fromEntries((await entriesOf(archive)).map(([name, content]) => [name, content.toString()]));
}

/** The company directory's tables: the oracle syncs them from PostHog's public team pages, so they name real people. */
const companyDirectory = ["companyProfiles/documents.jsonl", "companyTeams/documents.jsonl"];

describe("the oracle's export, trimmed for a public repository", () => {
  test("the company directory and the website build go, and the journeys' own data stays", async () => {
    const exported = zip({
      "companyProfiles/documents.jsonl": '{"_id":"p1","name":"A real person"}\n',
      "companyProfiles/generated_schema.jsonl": '"schema"\n',
      "companyTeams/documents.jsonl": '{"_id":"t1","name":"A real team"}\n',
      "kudosMessages/documents.jsonl": '{"_id":"m1"}\n',
      "_storage/documents.jsonl": '{"_id":"k1"}\n',
      "_storage/k1.png": "a card picture",
      "_components/staticHosting/_storage/documents.jsonl": '{"_id":"s1"}\n',
      "_components/staticHosting/_storage/s1": "the website build",
      "_components/staticHosting/staticAssets/documents.jsonl": '{"_id":"a1","storageId":"s1"}\n',
    });

    expect(await unzipped(await trimmed(exported))).toStrictEqual({
      "companyProfiles/documents.jsonl": "",
      "companyProfiles/generated_schema.jsonl": '"schema"\n',
      "companyTeams/documents.jsonl": "",
      "kudosMessages/documents.jsonl": '{"_id":"m1"}\n',
      "_storage/documents.jsonl": '{"_id":"k1"}\n',
      "_storage/k1.png": "a card picture",
      "_components/staticHosting/_storage/documents.jsonl": "",
      "_components/staticHosting/staticAssets/documents.jsonl": '{"_id":"a1","storageId":"s1"}\n',
    });
  });

  test("the committed fixture holds no company directory and no website build", async () => {
    const fixture = await unzipped(await readFile(oracleExport));
    for (const table of companyDirectory) expect(fixture[table], table).toBe("");
    expect(Object.keys(fixture).filter((name) => name.startsWith("_components/staticHosting/_storage/") && !name.endsWith("documents.jsonl"))).toStrictEqual([]);
  });
});
