// The oracle's data on the rewrite: the export today's app left after every journey passed against it (`pnpm e2e` with
// `E2E_EXPORT_TO`), loaded through the service's own `/admin/load` as the move will load production's, and round-tripped,
// so the journeys that follow run on a copy the move would have made. Its scheduled functions are set aside here: the
// oracle's pending work would run against a Slack the journeys never set up, and several name jobs still to be ported.
// Their recovery is proven on the same export by service/src/load/oracleExport.test.ts.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rewriteExport, scheduledSource } from "../../service/testing/exportZip.ts";

/** The export, kept in the repository so the proof still runs once the oracle can't make one (S20). */
export const oracleExport = fileURLToPath(new URL("../rewrite/oracleExport.zip", import.meta.url));

/** Bytes a chunk: well under the 16 MiB a staged chunk may hold. */
const chunkBytes = 8 * 1024 * 1024;

type LoadStatus = {
  phase: string;
  error: string | null;
  roundTrip: { equal: boolean; tables: Array<{ table: string; equal: boolean }> } | null;
};

/** Loads the export at `path` into the service at `serviceUrl`, and waits until the load is done. */
export async function loadExport(serviceUrl: string, token: string, path: string, { signal, timeoutMs = 300_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<void> {
  const archive = await rewriteExport(await readFile(path), (name, content) => (scheduledSource(name) === undefined ? content : Buffer.alloc(0)));
  const headers = { "x-hedgehug-admin-token": token };
  const chunks = Math.max(1, Math.ceil(archive.length / chunkBytes));
  for (let chunk = 0; chunk < chunks; chunk++) {
    const body = new Uint8Array(archive.subarray(chunk * chunkBytes, (chunk + 1) * chunkBytes));
    const staged = await fetch(`${serviceUrl}/admin/load?chunk=${chunk}`, { method: "POST", headers, body, signal });
    if (staged.status !== 200) throw new Error(`the service refused chunk ${chunk} of the oracle's export: ${staged.status} ${await staged.text()}`);
  }
  const sha256 = createHash("sha256").update(archive).digest("hex");
  const finished = await fetch(`${serviceUrl}/admin/load/finish`, { method: "POST", headers, body: JSON.stringify({ chunks, sha256 }), signal });
  if (finished.status !== 202) throw new Error(`the service refused to load the oracle's export: ${finished.status} ${await finished.text()}`);

  const until = Date.now() + timeoutMs;
  for (;;) {
    signal?.throwIfAborted();
    const status = (await (await fetch(`${serviceUrl}/admin/load`, { headers, signal })).json()) as LoadStatus;
    if (status.error !== null) throw new Error(`the oracle's export stopped in ${status.phase}: ${status.error}`);
    if (status.roundTrip && !status.roundTrip.equal) {
      const unequal = status.roundTrip.tables.filter(({ equal }) => !equal).map(({ table }) => table);
      throw new Error(`the oracle's export doesn't round-trip: ${unequal.join(", ")}`);
    }
    if (status.phase === "done") return;
    if (Date.now() > until) throw new Error(`the oracle's export wasn't loaded within ${timeoutMs} ms; it is in ${status.phase}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
