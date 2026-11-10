# The move's load

How Convex's data becomes the service's: an export of the paused deployment, loaded into an empty database through
`/admin/load`, checked by a round trip, and recovered into jobs. Every app route answers 503 until the load is `done`.

## 1. Export with the move's tool

```sh
node tools/move/export.ts --env-file <deployment env> --path <export.zip>
```

Never a bare `npx convex export`: it leaves out `_scheduled_functions`, so recovery would find no pending work and say
nothing. The tool runs `convex export --include-file-storage`, then adds each namespace's scheduled functions, the
app's and every component's, as `_scheduled_functions/documents.jsonl` in the export's encoding. It prints the count
for each namespace, and stops when every count is zero unless `--none-scheduled` says that is expected.

The env file names the deployment as `convex export` takes it: `CONVEX_SELF_HOSTED_URL` and
`CONVEX_SELF_HOSTED_ADMIN_KEY`. The tool only reads, through `convex export` and the admin API's system queries; it
never pushes or resumes a deployment.

**Open check:** the tool is proven on a local backend (the oracle's CI job). That it reads a paused cloud deployment,
export and system queries alike, is still to be shown, on the sandbox rehearsal, never on production.

## 2. Load

Start the service with `HEDGEHUG_ADMIN_TOKEN` set, on an empty database, and send the export with that token in
`x-hedgehug-admin-token`:

1. `POST /admin/load?chunk=<n>` for each chunk of the ZIP, in order, each at most 16 MiB.
2. `POST /admin/load/finish` with `{"chunks": <count>, "sha256": "<hex of the whole ZIP>"}`. It answers 202.
3. `GET /admin/load` until `phase` is `done`, or `error` names why it stopped.

The phases are `staging`, `loading`, `verifying` (the round trip, `roundTrip.ts`), `recovering` (`recovery.ts`) and
`done`. A stopped load resumes from its checkpoints on `finish` again, or starts over after `POST /admin/load/reset`.
A token that finished a load can't change it again. `e2e/local/oracleCopy.ts` does all three steps, and every
`pnpm e2e:rewrite` runs them on the oracle's own export (`e2e/rewrite/oracleExport.zip`).

## 3. Read the log

- `round trip equal`, with the number of tables, or `round trip differs` with how many differ.
- `load done`, with `jobs` (scheduled functions made jobs), `restarted` (cursor rows reset, `restarts.ts`) and
  `scheduled`, the count found in each namespace. `scheduled: none` means the export came without the tool.
