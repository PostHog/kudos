// The move's export: a Convex snapshot export, with what `convex export` leaves out that the move needs, its scheduled
// functions. The service's load reads the ZIP whole (service/src/load), and recovery turns each `_scheduled_functions`
// row into a job, so an export without them would move no pending work and say nothing. This adds each namespace's
// `_scheduled_functions/documents.jsonl`, the app's and every component's, in the export's own encoding.
//
//   node tools/move/export.ts --env-file <deployment env> --path <export.zip> [--none-scheduled]
//
// It only reads: `convex export` and system-table queries, never a push or a resume. An export that finds no scheduled
// function in any namespace stops with the counts, since this app always has some; `--none-scheduled` says that is
// expected. service/src/load/README.md holds the move's steps.
//
// The env file names the deployment as `npx convex export` takes it (`CONVEX_SELF_HOSTED_URL` and
// `CONVEX_SELF_HOSTED_ADMIN_KEY`, or a deploy key's own variables), and the URL and admin key are read from it.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs, parseEnv } from "node:util";
import { BaseConvexClient } from "convex/browser";
import type { Value as ConvexValue } from "convex/values";
import { printExport, type Value } from "../../service/src/db/codec.ts";
import { appendToZip, zipEntryNames } from "./zipAppend.ts";

/** Rows a page, as `npx convex data` reads them. */
const pageRows = 1_000;

/** Exports the deployment to `path` with its scheduled functions, and gives back how many it added a namespace. */
export async function exportForMove({ envFile, path, signal, noneScheduled = false }: { envFile: string; path: string; signal?: AbortSignal; noneScheduled?: boolean }): Promise<Record<string, number>> {
  await convex(["export", "--include-file-storage", "--path", path, "--env-file", envFile], signal);
  const { CONVEX_SELF_HOSTED_URL: url, CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey } = parseEnv(await readFile(envFile, "utf8"));
  if (!url || !adminKey) throw new Error(`${envFile} names no CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY`);
  return addScheduled({ path, connect: () => adminClient(url, adminKey), signal, noneScheduled });
}

/** What the export reads a deployment's system tables through: the parts of the CLI's own client it uses. */
export type ConvexReader = {
  subscribe(name: string, args: Record<string, ConvexValue>, options: { componentPath?: string }): { queryToken: string; unsubscribe: () => void };
  localQueryResultByToken(token: string): ConvexValue | undefined;
  close(): Promise<void>;
};

/** The CLI's own admin channel: `setAdminAuth` and a query's `componentPath` are internal to the client, and are what `npx convex data <table> --component <path>` reads a component's system tables with. */
export function adminClient(url: string, adminKey: string): ConvexReader {
  const client = new BaseConvexClient(url, () => {}, { unsavedChangesWarning: false, skipConvexDeploymentUrlCheck: true });
  (client as unknown as { setAdminAuth: (key: string) => void }).setAdminAuth(adminKey);
  return client as unknown as ConvexReader;
}

/** How long one page of scheduled functions may take: a page is small, so a deployment silent this long has stopped answering. */
const defaultPageTimeoutMs = 120_000;
/** How long a connection may take to close: the client waits for a stalled socket to open before it closes it. */
const closeMs = 1_000;

/**
 * Adds each namespace's `_scheduled_functions` to the export at `path`, and gives back how many it added a namespace.
 * Each namespace reads through a connection of its own: the client caches an answer under a token of the query's name
 * and args but not its component path, so one connection would hand a component another namespace's cached page.
 */
export async function addScheduled({
  path,
  connect,
  signal,
  noneScheduled = false,
  pageTimeoutMs = defaultPageTimeoutMs,
}: {
  path: string;
  connect: () => ConvexReader;
  signal?: AbortSignal;
  noneScheduled?: boolean;
  pageTimeoutMs?: number;
}): Promise<Record<string, number>> {
  const archive = await readFile(path);
  const counts: Record<string, number> = {};
  const entries: Record<string, string> = {};
  for (const component of componentsOf(zipEntryNames(archive))) {
    signal?.throwIfAborted();
    const client = connect();
    try {
      const rows = await scheduledFunctions(client, component, { signal, timeoutMs: pageTimeoutMs });
      const prefix = component === "" ? "" : `_components/${component.split("/").join("/_components/")}/`;
      entries[`${prefix}_scheduled_functions/documents.jsonl`] = rows.map((row) => `${printExport(row)}\n`).join("");
      counts[component === "" ? "app" : component] = rows.length;
    } finally {
      await closed(client);
    }
  }
  checkScheduled(counts, noneScheduled);
  await writeFile(path, appendToZip(archive, entries));
  return counts;
}

/** Closes `client`, waiting at most `closeMs`: a socket that never opened is left to the process's end, not waited on. */
async function closed(client: ConvexReader): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const waited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, closeMs);
    timer.unref();
  });
  await Promise.race([client.close().catch(() => {}), waited]);
  clearTimeout(timer);
}

/** Stops an export that found no scheduled function anywhere, unless the caller said none is expected. */
export function checkScheduled(counts: Record<string, number>, noneScheduled: boolean): void {
  if (noneScheduled || Object.values(counts).some((count) => count > 0)) return;
  throw new Error(`no scheduled function in any namespace (${JSON.stringify(counts)}): pass --none-scheduled if the deployment truly has none`);
}

/** The app (`""`) and each component's path (`posthog`, `parent/child`), from where the export put their tables. */
export function componentsOf(names: Iterable<string>): string[] {
  const components = new Set([""]);
  for (const name of names) {
    const match = /^((?:_components\/[^/]+\/)+)_tables\/documents\.jsonl$/.exec(name);
    if (match) components.add(match[1]!.split("/").filter((part, at) => at % 2 === 1 && part !== "").join("/"));
  }
  return [...components];
}

type Deadline = { signal?: AbortSignal; timeoutMs: number };

/** Every `_scheduled_functions` row of one namespace, oldest first. */
async function scheduledFunctions(client: ConvexReader, componentPath: string, deadline: Deadline): Promise<Value[]> {
  const rows: Value[] = [];
  let cursor: string | null = null;
  for (;;) {
    const args = { table: "_scheduled_functions", order: "asc", paginationOpts: { cursor, numItems: pageRows } };
    const page = (await once(client, "_system/cli/tableData", args, componentPath, deadline)) as { page: Value[]; isDone: boolean; continueCursor: string };
    rows.push(...page.page);
    if (page.isDone) return rows;
    cursor = page.continueCursor;
  }
}

/** One answer of a query, as the CLI reads one: subscribe, take the first result, unsubscribe; or stop at the deadline. */
function once(client: ConvexReader, name: string, args: Record<string, ConvexValue>, componentPath: string, { signal, timeoutMs }: Deadline): Promise<ConvexValue> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const { queryToken, unsubscribe } = client.subscribe(name, args, componentPath === "" ? {} : { componentPath });
    const settle = (settled: () => void) => {
      clearInterval(timer);
      clearTimeout(deadline);
      signal?.removeEventListener("abort", aborted);
      unsubscribe();
      settled();
    };
    const aborted = () => settle(() => reject(signal!.reason as Error));
    const check = () => {
      try {
        const result = client.localQueryResultByToken(queryToken);
        if (result !== undefined) settle(() => resolve(result));
      } catch (error) {
        settle(() => reject(error as Error));
      }
    };
    const timer = setInterval(check, 50);
    const deadline = setTimeout(
      () => settle(() => reject(new Error(`the deployment didn't answer for ${componentPath === "" ? "the app" : componentPath}'s scheduled functions within ${timeoutMs} ms`))),
      timeoutMs,
    );
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

function convex(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cli = spawn("npx", ["--no", "--", "convex", ...args], { stdio: ["ignore", "inherit", "inherit"], signal });
    cli.once("error", reject);
    cli.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`convex ${args[0]} exited with ${code}`))));
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { "env-file": { type: "string" }, path: { type: "string" }, "none-scheduled": { type: "boolean" } } });
  if (!values["env-file"] || !values.path) throw new Error("usage: node tools/move/export.ts --env-file <deployment env> --path <export.zip> [--none-scheduled]");
  try {
    const counts = await exportForMove({ envFile: values["env-file"], path: values.path, noneScheduled: values["none-scheduled"] ?? false });
    console.log(`exported to ${values.path}, scheduled functions by namespace: ${JSON.stringify(counts)}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
  // A connection that never opened would keep the process waiting on its socket.
  process.exit();
}
