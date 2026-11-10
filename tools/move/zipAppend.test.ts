// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { zip } from "../../service/testing/zip.ts";
import { componentsOf } from "./export.ts";
import { appendToZip, zipEntryNames } from "./zipAppend.ts";

// The reader the service's load opens a snapshot with (service/src/load/snapshot.ts), a dependency of the service's.
type Entry = { fileName: string };
type ZipFile = {
  on(event: "entry", listener: (entry: Entry) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  readEntry(): void;
  openReadStream(entry: Entry, callback: (error: Error | null, stream: NodeJS.ReadableStream) => void): void;
};
const yauzl = createRequire(new URL("../../service/package.json", import.meta.url))("yauzl") as {
  fromBuffer(buffer: Buffer, options: { lazyEntries: true }, callback: (error: Error | null, file: ZipFile) => void): void;
};

/** Every entry of `archive` and its content, read as the service's load reads a snapshot. */
function unzipped(archive: Buffer): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(archive, { lazyEntries: true }, (error, file) => {
      if (error) return reject(error);
      const read: Record<string, string> = {};
      file.on("entry", (entry) => {
        file.openReadStream(entry, (failure, stream) => {
          if (failure) return reject(failure);
          const parts: Buffer[] = [];
          stream.on("data", (part: Buffer) => parts.push(part));
          stream.on("end", () => {
            read[entry.fileName] = Buffer.concat(parts).toString();
            file.readEntry();
          });
        });
      });
      file.on("end", () => resolve(read));
      file.on("error", reject);
      file.readEntry();
    });
  });
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
});
