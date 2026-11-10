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

  const archive = await readFile(path);
  const counts: Record<string, number> = {};
  const entries: Record<string, string> = {};
  const client = new BaseConvexClient(url, () => {}, { unsavedChangesWarning: false, skipConvexDeploymentUrlCheck: true });
  try {
    // The CLI's own admin channel: `setAdminAuth` and a query's `componentPath` are internal to the client, and are what
    // `npx convex data <table> --component <path>` reads a component's system tables with.
    (client as unknown as { setAdminAuth: (key: string) => void }).setAdminAuth(adminKey);
    for (const component of componentsOf(zipEntryNames(archive))) {
      const rows = await scheduledFunctions(client, component);
      const prefix = component === "" ? "" : `_components/${component.split("/").join("/_components/")}/`;
      entries[`${prefix}_scheduled_functions/documents.jsonl`] = rows.map((row) => `${printExport(row)}\n`).join("");
      counts[component === "" ? "app" : component] = rows.length;
    }
  } finally {
    await client.close();
  }
  checkScheduled(counts, noneScheduled);
  await writeFile(path, appendToZip(archive, entries));
  return counts;
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

/** Every `_scheduled_functions` row of one namespace, oldest first. */
async function scheduledFunctions(client: BaseConvexClient, componentPath: string): Promise<Value[]> {
  const rows: Value[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = (await once(client, "_system/cli/tableData", { table: "_scheduled_functions", order: "asc", paginationOpts: { cursor, numItems: pageRows } }, componentPath)) as {
      page: Value[];
      isDone: boolean;
      continueCursor: string;
    };
    rows.push(...page.page);
    if (page.isDone) return rows;
    cursor = page.continueCursor;
  }
}

/** One answer of a query, as the CLI reads one: subscribe, take the first result, unsubscribe. */
function once(client: BaseConvexClient, name: string, args: Record<string, ConvexValue>, componentPath: string): Promise<ConvexValue> {
  const subscribe = client.subscribe.bind(client) as (name: string, args: Record<string, ConvexValue>, options: { componentPath?: string }) => ReturnType<BaseConvexClient["subscribe"]>;
  const { queryToken, unsubscribe } = subscribe(name, args, componentPath === "" ? {} : { componentPath });
  const read = client as unknown as { localQueryResultByToken: (token: string) => ConvexValue | undefined };
  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        const result = read.localQueryResultByToken(queryToken);
        if (result === undefined) return false;
        clearInterval(timer);
        unsubscribe();
        resolve(result);
        return true;
      } catch (error) {
        clearInterval(timer);
        unsubscribe();
        reject(error as Error);
        return true;
      }
    };
    const timer = setInterval(check, 50);
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
  const counts = await exportForMove({ envFile: values["env-file"], path: values.path, noneScheduled: values["none-scheduled"] ?? false });
  console.log(`exported to ${values.path}, scheduled functions by namespace: ${JSON.stringify(counts)}`);
}
