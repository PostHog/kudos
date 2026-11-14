// A snapshot export's entries, read with the reader the load opens it with (../src/load/snapshot.ts), and written back
// with ./zip.ts: for tools and tests that change an export, such as the oracle's fixture.
import yauzl from "yauzl";
import { zip } from "./zip.ts";

/** Every entry of `archive` with its content, in the export's order. */
export function entriesOf(archive: Buffer): Promise<Array<[string, Buffer]>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(archive, { lazyEntries: true }, (error, file) => {
      if (error) return reject(error);
      const read: Array<[string, Buffer]> = [];
      file.on("entry", (entry: yauzl.Entry) => {
        file.openReadStream(entry, (failure, stream) => {
          if (failure) return reject(failure);
          const parts: Buffer[] = [];
          stream.on("data", (part: Buffer) => parts.push(part));
          stream.on("end", () => {
            read.push([entry.fileName, Buffer.concat(parts)]);
            file.readEntry();
          });
          stream.on("error", reject);
        });
      });
      file.on("end", () => resolve(read));
      file.on("error", reject);
      file.readEntry();
    });
  });
}

/** `archive` with each entry `change` gives content for, and without each it gives `null` for. */
export async function rewriteExport(archive: Buffer, change: (name: string, content: Buffer) => Buffer | null): Promise<Buffer> {
  const kept: Record<string, Buffer> = {};
  for (const [name, content] of await entriesOf(archive)) {
    const changed = change(name, content);
    if (changed !== null) kept[name] = changed;
  }
  return zip(kept);
}

/** The namespace a `_scheduled_functions` entry belongs to, as the load names it (`app`, `_components/posthog`). */
export function scheduledSource(name: string): string | undefined {
  const match = /^(?:(.*)\/)?_scheduled_functions\/documents\.jsonl$/.exec(name);
  return match ? (match[1] ?? "app") : undefined;
}
