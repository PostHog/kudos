// Spike only, never merged. Keeps the backend's local storage directory in a Postgres table beside Convex's own,
// because the host gives no persistent disk and no object store: restore it before the backend starts, and copy
// new blobs in after the push and every few seconds after that. One connection, so the pool stays small.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import pg from "pg";

export async function openMirror(databaseUrl, ssl) {
  const client = new pg.Client({ connectionString: databaseUrl, ssl, application_name: "kudos-blob-mirror" });
  await client.connect();
  await client.query("CREATE TABLE IF NOT EXISTS blob_mirror (path text PRIMARY KEY, bytes bytea NOT NULL, size bigint NOT NULL, mirrored_at timestamptz NOT NULL DEFAULT now())");
  // Only delete what this copy saw on its own disk and then lost: during a rollout the other copy's new blobs are
  // missing here, and must not be deleted from the mirror.
  const seen = new Set();
  await client.query("CREATE TABLE IF NOT EXISTS deployed_push (id int PRIMARY KEY, digest text NOT NULL, deployed_at timestamptz NOT NULL DEFAULT now())");
  return {
    // The digest of the last push request that finished, so a restart of the same image skips the push.
    async deployedDigest() {
      const { rows } = await client.query("SELECT digest FROM deployed_push WHERE id = 1");
      return rows[0]?.digest ?? null;
    },
    async markDeployed(digest) {
      await client.query("INSERT INTO deployed_push (id, digest) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET digest = EXCLUDED.digest, deployed_at = now()", [digest]);
    },
    async restore(root) {
      const { rows } = await client.query("SELECT path FROM blob_mirror");
      let bytes = 0;
      for (const { path } of rows) {
        const { rows: [blob] } = await client.query("SELECT bytes FROM blob_mirror WHERE path = $1", [path]);
        const file = join(root, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, blob.bytes);
        seen.add(path);
        bytes += blob.bytes.length;
      }
      return { files: rows.length, bytes };
    },
    async sync(root) {
      const local = new Map();
      for (const file of await filesUnder(root)) local.set(relative(root, file), file);
      const { rows } = await client.query("SELECT path, size FROM blob_mirror");
      // An empty listing beside a non-empty mirror is a read failure or a wiped disk, never a reason to delete.
      if (local.size === 0 && rows.length > 0) throw new Error(`the storage directory lists no files but the mirror holds ${rows.length}`);
      const mirrored = new Map(rows.map((row) => [row.path, Number(row.size)]));
      let added = 0;
      let removed = 0;
      for (const [path, file] of local) {
        seen.add(path);
        const size = (await stat(file)).size;
        if (mirrored.get(path) === size) continue;
        await client.query("INSERT INTO blob_mirror (path, bytes, size) VALUES ($1, $2, $3) ON CONFLICT (path) DO UPDATE SET bytes = EXCLUDED.bytes, size = EXCLUDED.size, mirrored_at = now()", [path, await readFile(file), size]);
        added += 1;
      }
      for (const path of mirrored.keys()) {
        if (local.has(path) || !seen.has(path)) continue;
        await client.query("DELETE FROM blob_mirror WHERE path = $1", [path]);
        removed += 1;
      }
      // Read back what the mirror holds for every local file, so a caller can rely on it before it commits references.
      const { rows: after } = await client.query("SELECT path, size FROM blob_mirror");
      const held = new Map(after.map((row) => [row.path, Number(row.size)]));
      for (const [path, file] of local) if (held.get(path) !== (await stat(file)).size) throw new Error(`the mirror does not hold ${path}`);
      return { added, removed, files: local.size };
    },
    close: () => client.end(),
  };
}

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true, recursive: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}
