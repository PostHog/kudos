// Recovery: what Convex had scheduled, as jobs, and the flag definitions the PostHog component kept, seeded. It runs
// once the round trip found the copy equal, in one transaction that also ends the load, so a stopped or interrupted
// recovery leaves nothing behind and runs again whole.
//
// Every `_scheduled_functions` row, in every namespace, becomes a job under its own `_id`, so a row that names it,
// such as a replay's job, still finds it. Its name is the function's path, dotted, and a component's carries the
// component's path in front. A name maps to a registered job or to the retirement list; any other name stops
// recovery, finished rows included, so nothing is guessed. A retired row that would still run is canceled on the
// record. A pending row's args must pass its job's schema. A running mutation never committed, so it is pending again;
// a running action may have done its work, and an action runs at most once, so it failed. A workflow that carries a
// Convex paging cursor starts over (./restarts.ts).
import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { decodeStored, encodeStored, type Value } from "../db/codec.ts";
import { archive, flagDefinitions, jobs } from "../db/schema/index.ts";
import type { JobRegistry } from "../jobs/define.ts";
import { parseDefinitions } from "../analytics/definitions.ts";
import { LoadError } from "./loader.ts";
import { restartArgs, restartTables } from "./restarts.ts";
import { retiredJobs } from "./retired.ts";

type Kind = "mutation" | "action";
type JobRow = typeof jobs.$inferInsert;

/** Rows read and written at a time; a scheduled function's args are small. */
const batchRows = 200;
/** Problems named in a stop, at most; the rest are counted. */
const named = 20;

/** The job name of a Convex function path, such as `slack/delivery.js:send` (or `slack/delivery:send`) in a source. */
export function jobName(source: string, path: string): string {
  const [module, fn = "default"] = path.split(":");
  const dotted = `${module!.replace(/\.js$/, "").replaceAll("/", ".")}.${fn}`;
  return source === "app" ? dotted : `${source}/${dotted}`;
}

/** Turns the loaded copy's scheduled functions into jobs, seeds the flag definitions, and marks the load done. */
export async function recover(client: pg.PoolClient, registry: JobRegistry, now: number): Promise<{ jobs: number; restarted: number }> {
  const db = drizzle({ client });
  await client.query("begin");
  try {
    const unmapped = new Map<string, number>();
    const refused: string[] = [];
    let written = 0;
    let batch: JobRow[] = [];
    const flush = async () => {
      if (batch.length > 0 && unmapped.size === 0 && refused.length === 0) await db.insert(jobs).values(batch);
      written += batch.length;
      batch = [];
    };
    await client.query(`declare scheduled no scroll cursor for select source, document from archive where "table" = '_scheduled_functions' order by source, _id`);
    for (;;) {
      // The pool hands jsonb over as its text, the codec's stored form.
      const { rows } = await client.query<{ source: string; document: string }>(`fetch ${batchRows} from scheduled`);
      for (const { source, document } of rows) {
        const row = recovered(source, decodeStored(document) as { [field: string]: Value }, registry, now);
        if ("unmapped" in row) unmapped.set(row.unmapped, (unmapped.get(row.unmapped) ?? 0) + 1);
        else if ("refused" in row) refused.push(row.refused);
        else batch.push(row);
      }
      await flush();
      if (rows.length < batchRows) break;
    }
    await client.query("close scheduled");
    if (unmapped.size > 0) {
      const names = [...unmapped].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, count]) => `${name} (${count})`);
      throw new LoadError(`Recovery found scheduled functions no job or retirement maps: ${listed(names)}`);
    }
    if (refused.length > 0) throw new LoadError(`Recovery found pending args their job refuses: ${listed(refused)}`);
    const restarted = await restartTables(db);
    await seedFlagDefinitions(db);
    await client.query(`update "loadState" set phase = 'done' where key = 'load'`);
    await client.query("commit");
    return { jobs: written, restarted };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

function listed(items: string[]): string {
  return items.length > named ? `${items.slice(0, named).join(", ")} and ${items.length - named} more` : items.join(", ");
}

type Recovered = JobRow | { unmapped: string } | { refused: string };

/** One scheduled function as its job, or why it can't be one. */
function recovered(source: string, doc: { [field: string]: Value }, registry: JobRegistry, now: number): Recovered {
  const _id = doc._id as string;
  const name = jobName(source, doc.name as string);
  const job = registry.get(name);
  const retired = job ? undefined : retiredJobs.get(name);
  if (!job && !retired) return { unmapped: name };
  const kind: Kind = job?.kind ?? retired!;
  const state = (doc.state as { kind: string; error?: string }).kind;
  const error = (doc.state as { error?: string }).error ?? null;
  const completedAt = typeof doc.completedTime === "number" ? doc.completedTime : null;
  // Any Convex cursor restarted, on every row: a finished job's args can be replayed too.
  const args = Array.isArray(doc.args) && doc.args.length === 1 && isObject(doc.args[0]) ? restartArgs(name, doc.args[0]) : undefined;
  const row = { _id, _creationTime: doc._creationTime as number, name, args: encodeStored(args ?? {}), runAt: doc.scheduledTime as number, kind, deadline: null };

  const runs = state === "pending" || (state === "inProgress" && kind === "mutation");
  if (runs && retired) return { ...row, state: "canceled", error: "Retired at the move", completedAt: now };
  if (runs) {
    if (args === undefined) return { refused: `${_id} ${name} (args: not one object)` };
    const checked = job!.args.safeParse(args);
    if (!checked.success) return { refused: `${_id} ${name} (${checked.error.issues.map((issue) => `${issue.path.join(".") || "args"}: ${issue.code}`).join(", ")})` };
    return { ...row, state: "pending", error: null, completedAt: null };
  }
  // A failed job arrives swept: Convex's sweep reported its failures, and the service's sweep reports only its own.
  if (state === "inProgress") return { ...row, state: "failed", error: "Running when Convex stopped: an action runs at most once", completedAt: now, sweptAt: now };
  if (state === "failed") return { ...row, state, error, completedAt: completedAt ?? now, sweptAt: now };
  if (state === "success" || state === "canceled") return { ...row, state, error, completedAt: completedAt ?? now };
  return { refused: `${_id} ${name} (state: ${state})` };
}

const isObject = (value: Value | undefined): value is { [field: string]: Value } =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof ArrayBuffer);

/**
 * The flag definitions the PostHog component last fetched, as S1's one row: its `data` is the definitions as JSON,
 * already in the evaluator's shape. The refresh replaces them on its first good answer.
 */
async function seedFlagDefinitions(db: NodePgDatabase): Promise<void> {
  const rows = await db
    .select({ document: archive.document })
    .from(archive)
    .where(and(eq(archive.source, "_components/posthog"), eq(archive.table, "flagDefinitions")));
  if (rows.length === 0) return;
  if (rows.length > 1) throw new LoadError(`Recovery found ${rows.length} flag definitions rows in the PostHog component, where it keeps one`);
  const { data, fetchedAt } = decodeStored(rows[0]!.document) as { data: string; fetchedAt: number };
  // Checked as the refresh checks PostHog's answer, every field the evaluator reads; the component keeps it camelCased.
  const parsed = JSON.parse(data) as { flags?: unknown; groupTypeMapping?: unknown; cohorts?: unknown; propertyMatchingVersion?: unknown } | null;
  const definitions =
    parsed !== null && typeof parsed === "object"
      ? parseDefinitions({ flags: parsed.flags, group_type_mapping: parsed.groupTypeMapping, cohorts: parsed.cohorts, property_matching_version: parsed.propertyMatchingVersion })
      : null;
  if (definitions === null) throw new LoadError("Recovery found the PostHog component's flag definitions in a shape the evaluator doesn't take");
  await db.insert(flagDefinitions).values({ key: "posthog", definitions, fetchedAt });
}
