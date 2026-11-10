// The album's routes through the whole app: the website's code calls each by its former Convex name, the transport
// refuses arguments outside its shape before any handler runs, and a request it admits reaches that route's handler.
import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../../testing/database.ts";
import { seeder } from "../../../testing/seed.ts";
import { stillWaiting } from "../../../testing/waiting.ts";
import { createClock } from "../../clock.ts";
import type { HomeMember } from "../../feedback/homes.ts";
import { createApp } from "../../http/app.ts";
import { jsonLog } from "../../log.ts";
import { createOperations } from "../../operations.ts";
import type { Verified, VerifiedMember } from "../memberQuery.ts";
import { albumRoutes } from "./albumRoutes.ts";
import type { Route } from "./route.ts";
import { websiteRoutes } from "./table.ts";
import { apiHeader, apiTransport, type MemberCheck } from "./transport.ts";

const database = useTestDatabase();
const clock = createClock();
const log = jsonLog(() => {});
const operations = createOperations({ pool: database.pool, clock, log });
const seed = seeder(operations);

async function signedInJuno(): Promise<VerifiedMember> {
  const member = await seed.insert("members", { workspace: "T1", user: "U_JUNO", kind: "member", realName: "Juno Whitlock" });
  return { member, workspace: "T1", user: "U_JUNO", name: "Juno Whitlock" };
}

/** The app with the website's real route table, admitting Juno as the member she signed in as. */
function appFor(juno: VerifiedMember) {
  const verified: Verified = { me: juno, person: { kind: "member", member: juno.member, timeZone: undefined, admin: false } as unknown as HomeMember };
  const check: MemberCheck = { read: async () => verified, command: async () => verified };
  const identify = async () => ({ workspace: juno.workspace, user: juno.user, name: juno.name });
  return createApp({ commit: "0123abc", readiness: { migrations: () => "done" }, off: false, log, clock, routes: [apiTransport({ operations, log, routes: websiteRoutes, identify, check })] });
}

const ask = (app: ReturnType<typeof appFor>, name: string, args: unknown) =>
  app.request(`/api/query/${name}`, { method: "POST", headers: { "content-type": "application/json", [apiHeader]: "1" }, body: JSON.stringify(args) });

/** The first body each read reaches that another pull request or stack has yet to port. */
const firstStub = {
  "website.album.getAlbumPerson": ["S9", "album.flag.albumShownTo"],
  "website.album.getAlbumWeek": ["S9", "album.flag.albumShownTo"],
  "website.album.getAlbumProfile": ["S9", "album.flag.albumShownTo"],
  "website.book.getBook": ["S16", "website.unlockPath.unlockPathOf"],
} as const;

const reads = {
  "website.album.getAlbumPerson": { person: "m_somebody" },
  "website.album.getAlbumWeek": { week: "2026-11-09" },
  "website.album.getAlbumProfile": {},
  "website.book.getBook": {},
} as const;

describe("the album's reads, by their former Convex names", () => {
  test("are the album list's routes, each a query, in the website's route table", () => {
    expect(albumRoutes.map(({ name, kind }) => [name, kind])).toEqual(Object.keys(reads).map((name) => [name, "query"]));
    expect(websiteRoutes.filter(({ name }) => name in reads)).toHaveLength(Object.keys(reads).length);
  });

  test("refuse arguments outside their shape before any handler runs", async () => {
    const app = appFor(await signedInJuno());
    const misfits: Array<[string, unknown]> = [
      ["website.album.getAlbumPerson", {}],
      ["website.album.getAlbumPerson", { person: 7 }],
      ["website.album.getAlbumWeek", { week: 20261109 }],
      ["website.album.getAlbumWeek", { week: "2026-11-09", day: "Monday" }],
      ["website.album.getAlbumProfile", { person: "m_somebody" }],
      ["website.book.getBook", { page: 2 }],
    ];

    for (const [name, args] of misfits) {
      const answer = await ask(app, name, args);
      expect(answer.status, `${name} ${JSON.stringify(args)}`).toBe(400);
      expect(await answer.json()).toEqual({ error: "the arguments don't fit the route" });
    }
  });

  test("take the arguments their shape passes: a week may be left out", async () => {
    const app = appFor(await signedInJuno());

    for (const [name, args] of [...Object.entries(reads), ["website.album.getAlbumWeek", {}] as const]) {
      const answer = await ask(app, name, args);
      expect(answer.status, `${name} is found and its arguments fit`).not.toBe(404);
      expect(answer.status, `${name} ${JSON.stringify(args)}`).not.toBe(400);
    }
  });
});

describe("each read reaches its own handler", () => {
  type Handler = (ctx: Parameters<Route["handler"]>[0], me: VerifiedMember, args: unknown) => Promise<unknown>;
  const handlerOf = (name: keyof typeof reads) => albumRoutes.find((route) => route.name === name)!.handler as unknown as Handler;

  test.each(Object.keys(reads) as Array<keyof typeof reads>)("%s runs its port until the first body still to port", async (name) => {
    const juno = await signedInJuno();
    const [stack, path] = firstStub[name];

    const stub = await stillWaiting([stack], () => operations.query(`test.${name}`, (ctx) => handlerOf(name)(ctx, juno, reads[name])));

    expect(stub).toBe(path);
  });
});
