// The website API's transport, through the whole app: a route answers only a JSON request of the website's own, with
// arguments its schema passes, and only a member today's check verifies reaches its handler.
import { asc } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../../testing/database.ts";
import { createClock } from "../../clock.ts";
import type { HomeMember } from "../../feedback/homes.ts";
import { createApp } from "../../http/app.ts";
import { jsonLog } from "../../log.ts";
import { createOperations } from "../../operations.ts";
import { websiteClock } from "../../db/schema/website.ts";
import type { Denial, Verified } from "../memberQuery.ts";
import { memberCommand, memberRead, type Route } from "./route.ts";
import { apiHeader, apiTransport, type MemberCheck, type SignedIn } from "./transport.ts";

const database = useTestDatabase();

const juno: SignedIn = { workspace: "T1", user: "U_JUNO", name: "Juno Whitlock" };
const person = { kind: "member", member: "m_juno", timeZone: undefined, admin: false } as unknown as HomeMember;
const verified: Verified = { me: { member: person.member, ...juno }, person };

const greeting = memberRead("website.test.greeting", z.strictObject({ shout: z.boolean() }), async (_ctx, me, { shout }) => {
  const words = `hello ${me.name}`;
  return { words: shout ? words.toUpperCase() : words, user: me.user };
});
const ticks = memberRead("website.test.ticks", z.strictObject({}), async (ctx) => (await ctx.tx.select().from(websiteClock).orderBy(asc(websiteClock.tick))).map(({ tick }) => tick));
const tick = memberCommand("website.test.tick", z.strictObject({ at: z.number() }), async (ctx, _me, who, { at }) => {
  await ctx.tx.insert(websiteClock).values({ ...ctx.newRow(), tick: at });
  return { ticked: at, admin: who.admin };
});
const nothing = memberCommand("website.test.nothing", z.strictObject({}), async () => undefined);
const failing = memberRead("website.test.failing", z.strictObject({}), async () => {
  throw new Error("select secret from members where email = 'juno@example.com'");
});

type Calls = { reads: Array<SignedIn | null>; commands: Array<SignedIn | null>; identified: string[] };

function apiWith({ read = verified, command = verified, routes = [greeting, ticks, tick, nothing, failing] as Route[] }: { read?: Verified | Denial; command?: Verified | Denial; routes?: Route[] } = {}) {
  const calls: Calls = { reads: [], commands: [], identified: [] };
  const lines: Array<Record<string, unknown>> = [];
  const log = jsonLog((line) => lines.push(JSON.parse(line) as Record<string, unknown>));
  const clock = createClock();
  const operations = createOperations({ pool: database.pool, clock, log });
  const check: MemberCheck = {
    read: async (_ctx, signedIn) => (calls.reads.push(signedIn), read),
    command: async (_ctx, signedIn) => (calls.commands.push(signedIn), command),
  };
  const identify = async (request: Request) => {
    calls.identified.push(request.headers.get("x-signed-in-as") ?? "");
    return request.headers.get("x-signed-in-as") === "juno" ? juno : null;
  };
  const app = createApp({
    commit: "0123abc",
    readiness: { migrations: () => "done" },
    off: false,
    log,
    clock,
    routes: [apiTransport({ operations, log, routes, identify, check })],
  });
  return { app, calls, lines };
}

function sent(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json", [apiHeader]: "1", "x-signed-in-as": "juno", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) };
}

describe("a read", () => {
  test("answers its handler's result as JSON for the member the check verified, with the arguments its schema passed", async () => {
    const { app, calls } = apiWith();

    const answer = await app.request("/api/query/website.test.greeting", sent({ shout: true }));

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control"), "no answer is cached").toBe("no-store");
    expect(await answer.json()).toEqual({ words: "HELLO JUNO WHITLOCK", user: "U_JUNO" });
    expect(calls.reads, "the read check got who the request signed in as").toEqual([juno]);
    expect(calls.commands, "a read never runs the command check").toEqual([]);
  });

  test("answers the check's denial as its result, and its handler never runs", async () => {
    for (const denial of [{ kind: "signed-out" }, { kind: "not-a-member" }, { kind: "closed" }, { kind: "verifying" }, { kind: "unverified" }] as const) {
      const { app, lines } = apiWith({ read: denial });

      const answer = await app.request("/api/query/website.test.greeting", sent({ shout: false }, { "x-signed-in-as": "nobody" }));

      expect(answer.status, denial.kind).toBe(200);
      expect(await answer.json(), denial.kind).toEqual(denial);
      expect(lines.find((line) => line.message === "website request denied"), denial.kind).toMatchObject({ route: "website.test.greeting", denial: denial.kind });
    }
  });

  test("reads what the database holds, in a transaction of its own", async () => {
    const { app } = apiWith();
    await app.request("/api/mutation/website.test.tick", sent({ at: 2 }));
    await app.request("/api/mutation/website.test.tick", sent({ at: 1 }));

    const answer = await app.request("/api/query/website.test.ticks", sent({}));

    expect(await answer.json()).toEqual([1, 2]);
  });
});

describe("a command", () => {
  test("writes in its transaction and answers its result, for the member and person the command check admitted", async () => {
    const { app, calls } = apiWith();

    const answer = await app.request("/api/mutation/website.test.tick", sent({ at: 7 }));

    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ ticked: 7, admin: false });
    expect(calls.commands, "the command check got who the request signed in as").toEqual([juno]);
    expect(calls.reads, "a command never runs the read check").toEqual([]);
    expect(await (await apiWith().app.request("/api/query/website.test.ticks", sent({}))).json()).toEqual([7]);
  });

  test("a command the check denies answers the denial and writes nothing", async () => {
    const { app } = apiWith({ command: { kind: "closed" } });

    const answer = await app.request("/api/mutation/website.test.tick", sent({ at: 7 }));

    expect(await answer.json()).toEqual({ kind: "closed" });
    expect(await (await apiWith().app.request("/api/query/website.test.ticks", sent({}))).json(), "nothing was written").toEqual([]);
  });

  test("a command that returns nothing answers null, as Convex did", async () => {
    const answer = await apiWith().app.request("/api/mutation/website.test.nothing", sent({}));

    expect(answer.status).toBe(200);
    expect(await answer.json()).toBeNull();
  });
});

describe("only the website's own requests reach a route", () => {
  const notOwn: Array<[string, RequestInit]> = [
    ["without the API header", sent({ at: 1 }, { [apiHeader]: "" })],
    ["with the header set to something else", sent({ at: 1 }, { [apiHeader]: "yes" })],
    ["sent as a form, as a cross-site form would", sent("at=1", { "content-type": "application/x-www-form-urlencoded" })],
    ["sent as plain text, which no preflight guards", sent(JSON.stringify({ at: 1 }), { "content-type": "text/plain" })],
    ["that the browser says came from another site", sent({ at: 1 }, { "sec-fetch-site": "cross-site" })],
  ];

  test.each(notOwn)("a command %s is refused with 403 and writes nothing", async (_case, request) => {
    const { app, calls } = apiWith();

    const answer = await app.request("/api/mutation/website.test.tick", request);

    expect(answer.status).toBe(403);
    expect(calls.commands, "the check never ran").toEqual([]);
    expect(calls.identified, "nobody was looked up").toEqual([]);
    expect(await (await app.request("/api/query/website.test.ticks", sent({}))).json(), "nothing was written").toEqual([]);
  });

  test("a read without the API header is refused too", async () => {
    const { app } = apiWith();

    expect((await app.request("/api/query/website.test.greeting", sent({ shout: true }, { [apiHeader]: "" }))).status).toBe(403);
  });

  test("a same-origin request the browser marks as such passes", async () => {
    const answer = await apiWith().app.request("/api/query/website.test.greeting", sent({ shout: false }, { "sec-fetch-site": "same-origin" }));

    expect(answer.status).toBe(200);
  });
});

describe("arguments pass the route's schema or nothing runs", () => {
  const refusedArguments: Array<[string, string]> = [
    ["a missing field", JSON.stringify({})],
    ["a field of the wrong type", JSON.stringify({ shout: "yes" })],
    ["a field the route doesn't take", JSON.stringify({ shout: true, member: "m_other" })],
    ["no object at all", JSON.stringify([true])],
    ["a body that isn't JSON", "{shout: true"],
    ["no body", ""],
  ];

  test.each(refusedArguments)("%s answers 400, before anyone is looked up", async (_case, body) => {
    const { app, calls } = apiWith();

    const answer = await app.request("/api/query/website.test.greeting", sent(body));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: "the arguments don't fit the route" });
    expect(calls.identified).toEqual([]);
    expect(calls.reads).toEqual([]);
  });
});

describe("only the table's routes answer", () => {
  test("a name the table doesn't hold is a 404, never the website's page", async () => {
    const { app } = apiWith();

    for (const path of ["/api/query/website.test.missing", "/api/mutation/website.test.missing", "/api/query/", "/api/elsewhere", "/api"]) {
      const answer = await app.request(path, sent({}));
      expect(answer.status, path).toBe(404);
      expect(answer.headers.get("content-type"), path).toMatch(/^application\/json/);
    }
  });

  test("a read is never a command, nor a command a read", async () => {
    const { app } = apiWith();

    expect((await app.request("/api/mutation/website.test.greeting", sent({ shout: true }))).status).toBe(404);
    expect((await app.request("/api/query/website.test.tick", sent({ at: 1 }))).status).toBe(404);
    expect(await (await app.request("/api/query/website.test.ticks", sent({}))).json(), "nothing was written").toEqual([]);
  });

  test("only POST reaches a route", async () => {
    const { app } = apiWith();

    for (const method of ["GET", "PUT", "DELETE"]) expect((await app.request("/api/query/website.test.ticks", { method, headers: { [apiHeader]: "1" } })).status, method).toBe(404);
  });

  test("a route's failure answers 500 and the log keeps its message out", async () => {
    const { app, lines } = apiWith();

    const answer = await app.request("/api/query/website.test.failing", sent({}));

    expect(answer.status).toBe(500);
    expect(await answer.text()).not.toContain("secret");
    expect(JSON.stringify(lines)).not.toContain("juno@example.com");
  });
});

describe("the table holds each name once, as a Convex path", () => {
  test("two routes of one name stop the service at boot", () => {
    expect(() => apiWith({ routes: [greeting, memberCommand("website.test.greeting", z.strictObject({}), async () => null)] })).toThrow("Two website routes are named website.test.greeting");
  });

  test("a route named other than website.<module>.<function> is refused", () => {
    for (const name of ["album.getAlbum", "website.album", "website.album.get.album", "website.album.get-album", "website..getAlbum"]) {
      expect(() => memberRead(name, z.strictObject({}), async () => null), name).toThrow("website.<module>.<function>");
    }
  });
});
