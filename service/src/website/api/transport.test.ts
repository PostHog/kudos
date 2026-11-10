// The website API's transport, through the whole app: a route answers only a JSON request of the website's own, with
// arguments its shape passes, and only a member the check verifies reaches its handler. Every case reads what a browser
// or the database sees: the identity fake names whoever the request says, and throws for `explodes`, so a request the
// transport refused before looking anyone up answers its refusal, never the 500 of that throw.
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
import { apiHeader, apiTransport, maxBodyBytes, type Identity, type MemberCheck, type SignedIn } from "./transport.ts";

const database = useTestDatabase();

const people: Record<string, SignedIn> = {
  juno: { workspace: "T1", user: "U_JUNO", name: "Juno Whitlock" },
  ravi: { workspace: "T1", user: "U_RAVI", name: "Ravi Okafor" },
};

/** The member a check admits: whoever the request signed in as, an admin only when the check says so. */
function verifiedAs(signedIn: SignedIn, admin: boolean): Verified {
  const person = { kind: "member", member: `m_${signedIn.user}`, timeZone: undefined, admin } as unknown as HomeMember;
  return { me: { member: person.member, ...signedIn }, person };
}

type Gate = "admit" | Denial;

function checkOf({ read, command }: { read: Gate; command: Gate }): MemberCheck {
  const decide = (gate: Gate, identity: Identity, admin: boolean): Verified | Denial => {
    if ("kind" in identity) return identity;
    return gate === "admit" ? verifiedAs(identity, admin) : gate;
  };
  return {
    read: async (_ctx, identity) => decide(read, identity, false),
    command: async (_ctx, identity) => decide(command, identity, true),
  };
}

const greeting = memberRead("website.test.greeting", { shout: z.boolean() }, async (_ctx, me, { shout }) => {
  const words = `hello ${me.name}`;
  return { words: shout ? words.toUpperCase() : words, user: me.user, member: me.member };
});
const ticks = memberRead("website.test.ticks", {}, async (ctx) => (await ctx.tx.select().from(websiteClock).orderBy(asc(websiteClock.tick))).map(({ tick }) => tick));
const tick = memberCommand("website.test.tick", { at: z.number() }, async (ctx, me, person, { at }) => {
  await ctx.tx.insert(websiteClock).values({ ...ctx.newRow(), tick: at });
  return { ticked: at, by: me.user, admin: person.admin };
});
const tickThenFail = memberCommand("website.test.tickThenFail", { at: z.number() }, async (ctx, _me, _person, { at }) => {
  await ctx.tx.insert(websiteClock).values({ ...ctx.newRow(), tick: at });
  throw new Error("insert into members values ('juno@example.com')");
});
const nothing = memberCommand("website.test.nothing", {}, async () => undefined);
const closesItself = memberCommand("website.test.closesItself", {}, async () => ({ kind: "closed" as const }));
const failing = memberRead("website.test.failing", {}, async () => {
  throw new Error("select secret from members where email = 'juno@example.com'");
});
const nested = memberRead("website.test.nested", { filter: z.strictObject({ week: z.number() }).optional() }, async (_ctx, _me, { filter }) => filter?.week ?? null);

const allRoutes: Route[] = [greeting, ticks, tick, tickThenFail, nothing, closesItself, failing, nested];

function apiWith({ read = "admit", command = "admit", routes = allRoutes }: { read?: Gate; command?: Gate; routes?: Route[] } = {}) {
  const lines: Array<Record<string, unknown>> = [];
  const log = jsonLog((line) => lines.push(JSON.parse(line) as Record<string, unknown>));
  const clock = createClock();
  const operations = createOperations({ pool: database.pool, clock, log });
  const identify = async (request: Request) => {
    const who = request.headers.get("x-signed-in-as") ?? "";
    if (who === "explodes") throw new Error("the identity lookup ran");
    return people[who] ?? { kind: "signed-out" as const };
  };
  const app = createApp({
    commit: "0123abc",
    readiness: { migrations: () => "done" },
    off: false,
    log,
    clock,
    routes: [apiTransport({ operations, log, routes, identify, check: checkOf({ read, command }) })],
  });
  const ticked = async () => (await (await app.request("/api/query/website.test.ticks", sent({}))).json()) as number[];
  return { app, lines, ticked };
}

function sent(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json", [apiHeader]: "1", "x-signed-in-as": "juno", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) };
}

describe("a read", () => {
  test("answers its handler's result as JSON, for whoever the request signed in as, with the arguments its shape passed", async () => {
    const { app } = apiWith();

    const juno = await app.request("/api/query/website.test.greeting", sent({ shout: true }));
    const ravi = await app.request("/api/query/website.test.greeting", sent({ shout: false }, { "x-signed-in-as": "ravi" }));

    expect(juno.status).toBe(200);
    expect(juno.headers.get("cache-control"), "no answer is cached").toBe("no-store");
    expect(await juno.json()).toEqual({ words: "HELLO JUNO WHITLOCK", user: "U_JUNO", member: "m_U_JUNO" });
    expect(await ravi.json()).toEqual({ words: "hello Ravi Okafor", user: "U_RAVI", member: "m_U_RAVI" });
  });

  test("a request that signs in as nobody gets the check's signed-out, and the handler never runs", async () => {
    const answer = await apiWith().app.request("/api/query/website.test.greeting", sent({ shout: true }, { "x-signed-in-as": "nobody" }));

    expect(await answer.json()).toEqual({ kind: "signed-out" });
  });

  test("answers the read check's denial as its result, logged by kind", async () => {
    for (const denial of [{ kind: "not-a-member" }, { kind: "closed" }, { kind: "verifying" }, { kind: "unverified" }] as const) {
      const { app, lines } = apiWith({ read: denial });

      const answer = await app.request("/api/query/website.test.greeting", sent({ shout: false }));

      expect(answer.status, denial.kind).toBe(200);
      expect(await answer.json(), denial.kind).toEqual(denial);
      expect(lines.filter((line) => line.message === "website request denied"), denial.kind).toEqual([expect.objectContaining({ route: "website.test.greeting", denial: denial.kind })]);
    }
  });

  test("is admitted by the read check alone: a command check that denies everyone keeps reads open", async () => {
    const answer = await apiWith({ command: { kind: "closed" } }).app.request("/api/query/website.test.greeting", sent({ shout: false }));

    expect(await answer.json()).toMatchObject({ user: "U_JUNO" });
  });

  test("reads what the database holds", async () => {
    const { app, ticked } = apiWith();
    await app.request("/api/mutation/website.test.tick", sent({ at: 2 }));
    await app.request("/api/mutation/website.test.tick", sent({ at: 1 }));

    expect(await ticked()).toEqual([1, 2]);
  });
});

describe("a command", () => {
  test("writes in its transaction and answers its result, for the member and person the command check admitted", async () => {
    const { app, ticked } = apiWith();

    const answer = await app.request("/api/mutation/website.test.tick", sent({ at: 7 }, { "x-signed-in-as": "ravi" }));

    expect(answer.status).toBe(200);
    expect(await answer.json(), "the person is the command check's, an admin here").toEqual({ ticked: 7, by: "U_RAVI", admin: true });
    expect(await ticked()).toEqual([7]);
  });

  test("is admitted by the command check alone: a read check that denies everyone leaves commands to theirs", async () => {
    const { app } = apiWith({ read: { kind: "verifying" } });

    const answer = await app.request("/api/mutation/website.test.tick", sent({ at: 7 }));

    expect(await answer.json()).toEqual({ ticked: 7, by: "U_JUNO", admin: true });
  });

  test("a command the check denies answers the denial and writes nothing", async () => {
    const { app, lines } = apiWith({ command: { kind: "closed" } });

    const answer = await app.request("/api/mutation/website.test.tick", sent({ at: 7 }));

    expect(await answer.json()).toEqual({ kind: "closed" });
    expect(await apiWith().ticked(), "nothing was written").toEqual([]);
    expect(lines.filter((line) => line.message === "website request denied")).toEqual([expect.objectContaining({ route: "website.test.tick", denial: "closed" })]);
  });

  test("a command that writes and then fails answers 500 and leaves nothing written", async () => {
    const { app, ticked, lines } = apiWith();

    const answer = await app.request("/api/mutation/website.test.tickThenFail", sent({ at: 7 }));

    expect(answer.status).toBe(500);
    expect(await answer.text()).not.toContain("juno@example.com");
    expect(JSON.stringify(lines)).not.toContain("juno@example.com");
    expect(await ticked()).toEqual([]);
  });

  test("a command that returns nothing answers null, as Convex did", async () => {
    const answer = await apiWith().app.request("/api/mutation/website.test.nothing", sent({}));

    expect(answer.status).toBe(200);
    expect(await answer.json()).toBeNull();
  });

  test("a result that reads like a denial is the handler's own, never logged as a denial", async () => {
    const { app, lines } = apiWith();

    const answer = await app.request("/api/mutation/website.test.closesItself", sent({}));

    expect(await answer.json()).toEqual({ kind: "closed" });
    expect(lines.filter((line) => line.message === "website request denied")).toEqual([]);
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

  test.each(notOwn)("a command %s is refused with 403 before anyone is looked up, and writes nothing", async (_case, request) => {
    const { app, ticked } = apiWith();
    const headers = new Headers(request.headers);
    headers.set("x-signed-in-as", "explodes");

    const answer = await app.request("/api/mutation/website.test.tick", { ...request, headers });

    expect(answer.status).toBe(403);
    expect(await answer.json()).toEqual({ error: "not a request of the website's own" });
    expect(await ticked()).toEqual([]);
  });

  test("a read without the API header is refused too", async () => {
    expect((await apiWith().app.request("/api/query/website.test.greeting", sent({ shout: true }, { [apiHeader]: "" }))).status).toBe(403);
  });

  test("a same-origin request, and JSON with a charset, pass", async () => {
    const { app } = apiWith();

    expect((await app.request("/api/query/website.test.greeting", sent({ shout: false }, { "sec-fetch-site": "same-origin" }))).status).toBe(200);
    expect((await app.request("/api/query/website.test.greeting", sent({ shout: false }, { "content-type": "application/json; charset=utf-8" }))).status).toBe(200);
  });

  test("a preflight gets no permission: the API names no other origin", async () => {
    const answer = await apiWith().app.request("/api/mutation/website.test.tick", { method: "OPTIONS", headers: { origin: "https://elsewhere.example", "access-control-request-method": "POST", "access-control-request-headers": apiHeader } });

    expect(answer.status).toBe(404);
    expect(answer.headers.get("access-control-allow-origin")).toBeNull();
    expect(answer.headers.get("access-control-allow-headers")).toBeNull();
  });

  test("a failed identity lookup answers 500 without its message", async () => {
    const answer = await apiWith().app.request("/api/query/website.test.greeting", sent({ shout: true }, { "x-signed-in-as": "explodes" }));

    expect(answer.status).toBe(500);
    expect(await answer.text()).not.toContain("identity lookup");
  });
});

describe("arguments pass the route's shape or nothing runs", () => {
  const refusedArguments: Array<[string, string]> = [
    ["a missing field", JSON.stringify({})],
    ["a field of the wrong type", JSON.stringify({ shout: "yes" })],
    ["a field the route doesn't take", JSON.stringify({ shout: true, member: "m_other" })],
    ["no object at all", JSON.stringify([true])],
    ["a body that isn't JSON", "{shout: true"],
    ["no body", ""],
  ];

  test.each(refusedArguments)("%s answers 400, before anyone is looked up", async (_case, body) => {
    const answer = await apiWith().app.request("/api/query/website.test.greeting", sent(body, { "x-signed-in-as": "explodes" }));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: "the arguments don't fit the route" });
  });

  test("a field an object inside the arguments doesn't take answers 400 too", async () => {
    const { app } = apiWith();

    expect(await (await app.request("/api/query/website.test.nested", sent({ filter: { week: 3 } }))).json()).toBe(3);
    expect((await app.request("/api/query/website.test.nested", sent({ filter: { week: 3, member: "m_other" } }, { "x-signed-in-as": "explodes" }))).status).toBe(400);
  });

  test("a route whose arguments hold an object that keeps unknown fields stops the service at boot", () => {
    expect(() => memberRead("website.test.loose", { filter: z.object({ week: z.number() }) }, async () => null)).toThrow("website.test.loose(filter) is an object that keeps unknown fields");
    expect(() => memberRead("website.test.loose", { filters: z.array(z.object({ week: z.number() })).optional() }, async () => null)).toThrow("website.test.loose(filters)[] is an object");
 
  });

  test("a route whose arguments hold a kind of value Convex couldn't describe, or change a value they check, stops the service at boot", () => {
    const loose = z.object({ week: z.number() });
    const refused: Array<[string, z.ZodType]> = [
      ["pipe", z.string().transform((value) => value.length)],
      ["intersection", z.intersection(z.strictObject({ week: z.number() }), loose)],
      ["lazy", z.lazy(() => loose)],
      ["catch", loose.catch({ week: 0 })],
      ["any", z.any()],
      ["unknown", z.unknown()],
      ["date", z.date()],
      ["default", z.strictObject({ week: z.number() }).default({ week: 0 })],
      ["coercion", z.coerce.string()],
      ["trim", z.string().trim()],
      ["overwrite inside an object", z.strictObject({ week: z.number() }).overwrite((value) => ({ ...value, member: "m_other" }))],
      ["overwrite of a record's key", z.record(z.string().overwrite(() => "same"), z.number())],
      ["refinement", z.string().refine((value) => value.length > 0)],
      ["URL, as a record's key", z.record(z.url(), z.number())],
      ["URL as a check", z.string().check(z.url())],
      [
        "a property's own refinement",
        z.strictObject({ nested: z.strictObject({ week: z.number() }) }).check(
          z.property(
            "nested",
            z.custom<{ week: number }>((value) => {
              (value as Record<string, unknown>).member = "m_other";
              return true;
            }),
          ),
        ),
      ],
      ["properties", z.strictObject({ week: z.number() }).check(z.properties({ week: z.number() }))],
    ];
    for (const [kind, schema] of refused) {
      expect(() => memberRead("website.test.odd", { value: schema }, async () => null), kind).toThrow(/website\.test\.odd\(value\)/);
    }
    expect(() => memberRead("website.test.plain", { name: z.string(), week: z.number().int().optional(), kind: z.enum(["a", "b"]), tags: z.record(z.string(), z.boolean()), pair: z.tuple([z.string(), z.number()]), either: z.union([z.literal("x"), z.null()]), email: z.email(), short: z.string().max(80).regex(/^[a-z]+$/), many: z.array(z.string()).min(1), positive: z.number().gt(0) }, async () => null)).not.toThrow();
  });

  test("a body over the limit answers 413 before it is read whole, with or without its length", async () => {
    const { app } = apiWith();
    const big = JSON.stringify({ shout: true, padding: "x".repeat(maxBodyBytes) });

    const declared = await app.request("/api/query/website.test.greeting", sent(big, { "x-signed-in-as": "explodes" }));
    const streamed = await app.request(
      new Request("http://localhost/api/query/website.test.greeting", {
        method: "POST",
        headers: { "content-type": "application/json", [apiHeader]: "1", "x-signed-in-as": "explodes" },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(big));
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit),
    );

    expect(declared.status).toBe(413);
    expect(streamed.status).toBe(413);
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
    const { app, ticked } = apiWith();

    expect((await app.request("/api/mutation/website.test.greeting", sent({ shout: true }))).status).toBe(404);
    expect((await app.request("/api/query/website.test.tick", sent({ at: 1 }))).status).toBe(404);
    expect(await ticked()).toEqual([]);
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
    expect(() => apiWith({ routes: [greeting, memberCommand("website.test.greeting", {}, async () => null)] })).toThrow("Two website routes are named website.test.greeting");
  });

  test("a route named other than website.<module>.<function> is refused", () => {
    for (const name of ["album.getAlbum", "website.album", "website.album.get.album", "website.album.get-album", "website..getAlbum"]) {
      expect(() => memberRead(name, {}, async () => null), name).toThrow("website.<module>.<function>");
    }
  });
});
