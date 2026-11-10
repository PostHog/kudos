// @vitest-environment node
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { entriesOf } from "../../service/testing/exportZip.ts";
import { zip } from "../../service/testing/zip.ts";
import { addScheduled, adminClient, checkScheduled, componentsOf, type ConvexReader } from "./export.ts";
import { appendToZip, zipEntryNames } from "./zipAppend.ts";

/** Every entry of `archive` and its content, read as the service's load reads a snapshot. */
async function unzipped(archive: Buffer): Promise<Record<string, string>> {
  return Object.fromEntries((await entriesOf(archive)).map(([name, content]) => [name, content.toString()]));
}

/** A `convex export` of an app with two components, as the CLI leaves it: no `_scheduled_functions` anywhere. */
const threeNamespaces = {
  "_tables/documents.jsonl": '{"name":"kudosMessages","id":10001}\n',
  "kudosMessages/documents.jsonl": '{"_id":"m1"}\n',
  "_components/posthog/_tables/documents.jsonl": '{"name":"flagDefinitions","id":10001}\n',
  "_components/staticHosting/_tables/documents.jsonl": '{"name":"staticAssets","id":10001}\n',
};

async function exported(entries: Record<string, string>): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "move-export-")), "export.zip");
  await writeFile(path, zip(entries));
  return path;
}

function scheduledRow(id: string) {
  return { _id: id, _creationTime: 1_700_000_000_000, name: "slack/delivery.js:send", args: [{}], scheduledTime: 1_700_000_000_000, state: { kind: "pending" } };
}

/**
 * A Convex deployment as the CLI's client reaches it: each client caches an answer under a query token made of the
 * function's name and args, but not its component path, and keeps it after an unsubscribe until the server's next
 * transition; the server answers each new query late, as a deployment across a network does.
 */
class FakeDeployment {
  private clients = 0;
  private subscriptions = 0;
  constructor(
    private readonly tables: Record<string, ReturnType<typeof scheduledRow>[]>,
    private readonly options: { silent?: string; answerMs?: number } = {},
  ) {}

  open() {
    return { clients: this.clients, subscriptions: this.subscriptions };
  }

  readonly connect = (): ConvexReader => {
    this.clients++;
    const cache = new Map<string, unknown>();
    let closed = false;
    return {
      subscribe: (name, args, { componentPath = "" }) => {
        const queryToken = JSON.stringify([name, args]);
        this.subscriptions++;
        let subscribed = true;
        if (name !== "_system/cli/tableData" || (args as { table?: string }).table !== "_scheduled_functions") throw new Error(`no ${name} here`);
        if (componentPath !== this.options.silent) {
          setTimeout(() => {
            if (closed) return;
            const { cursor, numItems } = (args as { paginationOpts: { cursor: string | null; numItems: number } }).paginationOpts;
            const rows = this.tables[componentPath] ?? [];
            const from = cursor === null ? 0 : Number(cursor);
            const to = from + numItems;
            cache.set(queryToken, { page: rows.slice(from, to), isDone: to >= rows.length, continueCursor: String(to) });
          }, this.options.answerMs ?? 120);
        }
        return {
          queryToken,
          unsubscribe: () => {
            if (subscribed) this.subscriptions--;
            subscribed = false;
          },
        };
      },
      localQueryResultByToken: (token) => cache.get(token) as never,
      close: async () => {
        if (!closed) this.clients--;
        closed = true;
      },
    };
  };
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

  test("each namespace's scheduled functions are its own, however late the deployment answers and however many pages they fill", async () => {
    const deployment = new FakeDeployment({
      "": Array.from({ length: 1_001 }, (_, at) => scheduledRow(`app${at}`)),
      posthog: [scheduledRow("posthog0")],
      staticHosting: [],
    });
    const path = await exported(threeNamespaces);

    const counts = await addScheduled({ path, connect: deployment.connect });

    expect(counts).toStrictEqual({ app: 1_001, posthog: 1, staticHosting: 0 });
    const added = await unzipped(await readFile(path));
    const ids = (content: string | undefined) => (content ?? "").split("\n").filter(Boolean).map((line) => (JSON.parse(line) as { _id: string })._id);
    expect(ids(added["_scheduled_functions/documents.jsonl"])).toStrictEqual(Array.from({ length: 1_001 }, (_, at) => `app${at}`));
    expect(ids(added["_components/posthog/_scheduled_functions/documents.jsonl"])).toStrictEqual(["posthog0"]);
    expect(ids(added["_components/staticHosting/_scheduled_functions/documents.jsonl"])).toStrictEqual([]);
    expect(added["kudosMessages/documents.jsonl"], "the export's own entries stay").toBe('{"_id":"m1"}\n');
    expect(deployment.open(), "every connection closed and every query let go").toStrictEqual({ clients: 0, subscriptions: 0 });
  });

  test("a deployment that stops answering ends the read with the namespace named, and leaves the export as it was", async () => {
    const deployment = new FakeDeployment({ "": [scheduledRow("app0")], posthog: [scheduledRow("posthog0")], staticHosting: [] }, { silent: "posthog" });
    const path = await exported(threeNamespaces);

    await expect(addScheduled({ path, connect: deployment.connect, pageTimeoutMs: 300 })).rejects.toThrow("the deployment didn't answer for posthog's scheduled functions within 300 ms");

    expect(deployment.open(), "every connection closed and every query let go").toStrictEqual({ clients: 0, subscriptions: 0 });
    expect(zipEntryNames(await readFile(path)), "nothing added").toStrictEqual(Object.keys(threeNamespaces));
  });

  test("a deployment that takes the connection but never opens it ends the read at the deadline, with the CLI's own client", async () => {
    const sockets = new Set<Socket>();
    const stalled = createServer((socket) => sockets.add(socket));
    await new Promise<void>((resolve) => stalled.listen(0, "127.0.0.1", resolve));
    const path = await exported(threeNamespaces);
    try {
      const started = Date.now();
      const url = `http://127.0.0.1:${(stalled.address() as AddressInfo).port}`;

      await expect(addScheduled({ path, connect: () => adminClient(url, "an-admin-key"), pageTimeoutMs: 200 })).rejects.toThrow("the deployment didn't answer for the app's scheduled functions within 200 ms");

      expect(Date.now() - started, "the deadline holds while the connection won't close").toBeLessThan(1_500);
    } finally {
      for (const socket of sockets) socket.destroy();
      stalled.close();
    }
  });

  test("an aborted export stops reading at once and closes its connection", async () => {
    const deployment = new FakeDeployment({ "": [scheduledRow("app0")], posthog: [], staticHosting: [] }, { silent: "" });
    const path = await exported(threeNamespaces);
    const abort = new AbortController();

    const reading = addScheduled({ path, connect: deployment.connect, signal: abort.signal });
    setTimeout(() => abort.abort(new Error("the operator stopped it")), 100);

    await expect(reading).rejects.toThrow("the operator stopped it");
    expect(deployment.open(), "every connection closed and every query let go").toStrictEqual({ clients: 0, subscriptions: 0 });
  });

  test("an export that found no scheduled function in any namespace stops, counts named, unless none is expected", () => {
    expect(() => checkScheduled({ app: 0, posthog: 0 }, false)).toThrow('no scheduled function in any namespace ({"app":0,"posthog":0})');
    expect(() => checkScheduled({ app: 0, posthog: 0 }, true)).not.toThrow();
    expect(() => checkScheduled({ app: 0, posthog: 2 }, false)).not.toThrow();
  });
});
