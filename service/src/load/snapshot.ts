// The staged snapshot ZIP, read where it lies: in `loadChunks`, a chunk at a time, never whole in memory.
import { Readable } from "node:stream";
import type pg from "pg";
import yauzl from "yauzl";

export interface Snapshot {
  /** Every entry of the ZIP by its path. */
  entries: Map<string, yauzl.Entry>;
  open(entry: yauzl.Entry): Promise<Readable>;
  close(): void;
}

/**
 * Opens the staged chunks `0..chunks-1` as one ZIP. Reads hold one chunk in memory at a time, and go through the pool,
 * outside the loader's transactions, so a batch that fails never has a read queued inside it.
 */
export async function openSnapshot(pool: pg.Pool, chunks: number): Promise<Snapshot> {
  const { rows } = await pool.query<{ number: number; size: number }>(
    'select number, length(bytes) as size from "loadChunks" where number < $1 order by number',
    [chunks],
  );
  if (rows.length !== chunks || rows.some((row, at) => row.number !== at)) throw new Error("The snapshot is missing chunks");
  const starts: number[] = [];
  let size = 0;
  for (const row of rows) {
    starts.push(size);
    size += row.size;
  }

  let cached: { number: number; bytes: Buffer } | undefined;
  const chunk = async (number: number): Promise<Buffer> => {
    if (cached?.number !== number) {
      const result = await pool.query<{ bytes: Buffer }>('select bytes from "loadChunks" where number = $1', [number]);
      cached = { number, bytes: result.rows[0]!.bytes };
    }
    return cached.bytes;
  };

  class ChunkReader extends yauzl.RandomAccessReader {
    _readStreamForRange(start: number, end: number): Readable {
      return Readable.from(
        (async function* () {
          let at = start;
          while (at < end) {
            const number = starts.findLastIndex((start) => start <= at);
            const bytes = await chunk(number);
            const from = at - starts[number]!;
            const piece = bytes.subarray(from, Math.min(bytes.length, from + end - at));
            at += piece.length;
            yield piece;
          }
        })(),
        { objectMode: false },
      );
    }
  }

  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.fromRandomAccessReader(new ChunkReader(), size, { lazyEntries: true, autoClose: false }, (error, zip) =>
      error ? reject(error) : resolve(zip!),
    ),
  );
  const entries = new Map<string, yauzl.Entry>();
  await new Promise<void>((resolve, reject) => {
    zip.on("entry", (entry: yauzl.Entry) => {
      entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.once("end", resolve);
    zip.once("error", reject);
    zip.readEntry();
  });

  return {
    entries,
    open: (entry) =>
      new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream!)))),
    close: () => zip.close(),
  };
}
