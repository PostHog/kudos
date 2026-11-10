// @vitest-environment node
import { describe, expect, test } from "vitest";
import { entriesOf } from "../../service/testing/exportZip.ts";
import { zip } from "../../service/testing/zip.ts";
import { checkScheduled, componentsOf } from "./export.ts";
import { appendToZip, zipEntryNames } from "./zipAppend.ts";

/** Every entry of `archive` and its content, read as the service's load reads a snapshot. */
async function unzipped(archive: Buffer): Promise<Record<string, string>> {
  return Object.fromEntries((await entriesOf(archive)).map(([name, content]) => [name, content.toString()]));
}

describe("the move's export adds what `convex export` leaves out", () => {
  test("entries added to an export are read with every entry it had, each with its content", async () => {
    const exported = zip({ "README.md": "An export.", "_tables/documents.jsonl": '{"name":"kudosMessages","id":10001}\n', "kudosMessages/documents.jsonl": '{"_id":"m1"}\n' });

    const moved = appendToZip(exported, {
      "_scheduled_functions/documents.jsonl": '{"_id":"s1","name":"slack/delivery.js:send"}\n',
      "_components/posthog/_scheduled_functions/documents.jsonl": "",
    });

    expect(await unzipped(moved)).toStrictEqual({
      "README.md": "An export.",
      "_tables/documents.jsonl": '{"name":"kudosMessages","id":10001}\n',
      "kudosMessages/documents.jsonl": '{"_id":"m1"}\n',
      "_scheduled_functions/documents.jsonl": '{"_id":"s1","name":"slack/delivery.js:send"}\n',
      "_components/posthog/_scheduled_functions/documents.jsonl": "",
    });
    expect(zipEntryNames(moved)).toHaveLength(5);
  });

  test("an entry the export already has stops the append, so no reader can take the export's copy instead", () => {
    const exported = zip({ "_scheduled_functions/documents.jsonl": "" });
    expect(() => appendToZip(exported, { "_scheduled_functions/documents.jsonl": "{}\n" })).toThrow("the ZIP already has _scheduled_functions/documents.jsonl");
  });

  test("the namespaces are the app and every component the export holds tables of, nested ones by their path", () => {
    expect(
      componentsOf([
        "README.md",
        "_tables/documents.jsonl",
        "_components/posthog/_tables/documents.jsonl",
        "_components/posthog/flagDefinitions/documents.jsonl",
        "_components/staticHosting/_tables/documents.jsonl",
        "_components/workflow/_components/workpool/_tables/documents.jsonl",
      ]),
    ).toStrictEqual(["", "posthog", "staticHosting", "workflow/workpool"]);
  });

  test("an export that found no scheduled function in any namespace stops, counts named, unless none is expected", () => {
    expect(() => checkScheduled({ app: 0, posthog: 0 }, false)).toThrow('no scheduled function in any namespace ({"app":0,"posthog":0})');
    expect(() => checkScheduled({ app: 0, posthog: 0 }, true)).not.toThrow();
    expect(() => checkScheduled({ app: 0, posthog: 2 }, false)).not.toThrow();
  });
});
