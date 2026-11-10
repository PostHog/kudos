// The album's routes through the whole app: the website's code calls each by its former Convex name, the transport
// refuses arguments outside its shape before any handler runs, and a request it admits gets that read's own answer.
import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../../testing/database.ts";
import { definitionsStored, onForEveryone } from "../../../testing/flags.ts";
import { seeder } from "../../../testing/seed.ts";
import { waitsOn } from "../../../testing/waiting.ts";
import { albumFlag } from "../../album/flag.ts";
import { createClock } from "../../clock.ts";
import type { HomeMember } from "../../feedback/homes.ts";
import { createApp } from "../../http/app.ts";
import { jsonLog } from "../../log.ts";
import { NotPortedError } from "../../notPorted.ts";
import { createOperations } from "../../operations.ts";
import { getAlbumPerson, getAlbumProfile, getAlbumWeek } from "../album.ts";
import { getBook } from "../book.ts";
import type { Verified, VerifiedMember } from "../memberQuery.ts";
import { albumRoutes } from "./albumRoutes.ts";
import { websiteRoutes } from "./table.ts";
import { apiHeader, apiTransport, type MemberCheck } from "./transport.ts";

const database = useTestDatabase();
const clock = createClock();
const operations = createOperations({ pool: database.pool, clock, log: jsonLog(() => {}) });
const seed = seeder(operations);

async function signedInJuno(): Promise<VerifiedMember> {
  const member = await seed.insert("members", { workspace: "T1", user: "U_JUNO", kind: "member", realName: "Juno Whitlock" });
  return { member, workspace: "T1", user: "U_JUNO", name: "Juno Whitlock" };
}

/** The app with the website's real route table, admitting Juno as the member she signed in as. */
async function websiteFor() {
  const juno = await signedInJuno();
  const lines: Array<Record<string, unknown>> = [];
  const log = jsonLog((line) => lines.push(JSON.parse(line) as Record<string, unknown>));
  const verified: Verified = { me: juno, person: { kind: "member", member: juno.member, timeZone: undefined, admin: false } as unknown as HomeMember };
  const check: MemberCheck = { read: async () => verified, command: async () => verified };
  const identify = async () => ({ workspace: juno.workspace, user: juno.user, name: juno.name });
  const app = createApp({ commit: "0123abc", readiness: { migrations: () => "done" }, off: false, log, clock, routes: [apiTransport({ operations, log, routes: websiteRoutes, identify, check })] });
  const ask = (name: string, args: unknown) => app.request(`/api/query/${name}`, { method: "POST", headers: { "content-type": "application/json", [apiHeader]: "1" }, body: JSON.stringify(args) });

  /**
   * The read's JSON answer. A handler that reaches a body another stack has yet to port answers 500, and the request
   * log names the error's class only, so that one failure comes back as the `NotPortedError` a waiting test waits on.
   */
  const answerOf = async (name: string, args: unknown): Promise<unknown> => {
    const answer = await ask(name, args);
    if (answer.status === 500 && lines.some((line) => line.message === "request failed" && line.path === `/api/query/${name}` && line.error === "NotPortedError")) throw new NotPortedError(`${name}, through the app`);
    expect(answer.status, `${name} ${JSON.stringify(args)}`).toBe(200);
    return answer.json();
  };
  return { ask, answerOf };
}

const reads = ["website.album.getAlbumPerson", "website.album.getAlbumWeek", "website.album.getAlbumProfile", "website.book.getBook"];

describe("the album's reads, by their former Convex names", () => {
  test("are the album list's queries, each bound to its port as it is, in the website's route table", () => {
    expect(albumRoutes.map(({ name, kind, handler }) => [name, kind, handler])).toEqual([
      ["website.album.getAlbumPerson", "query", getAlbumPerson],
      ["website.album.getAlbumWeek", "query", getAlbumWeek],
      ["website.album.getAlbumProfile", "query", getAlbumProfile],
      ["website.book.getBook", "query", getBook],
    ]);
    expect(websiteRoutes.filter(({ name }) => reads.includes(name)).map(({ name }) => name)).toEqual(reads);
  });

  test("refuse arguments outside their shape before any handler runs", async () => {
    const { ask } = await websiteFor();
    const misfits: Array<[string, unknown]> = [
      ["website.album.getAlbumPerson", {}],
      ["website.album.getAlbumPerson", { person: 7 }],
      ["website.album.getAlbumWeek", { week: 20261109 }],
      ["website.album.getAlbumWeek", { week: "2026-11-09", day: "Monday" }],
      ["website.album.getAlbumProfile", { person: "m_somebody" }],
      ["website.book.getBook", { page: 2 }],
    ];

    for (const [name, args] of misfits) {
      const answer = await ask(name, args);
      expect(answer.status, `${name} ${JSON.stringify(args)}`).toBe(400);
      expect(await answer.json()).toEqual({ error: "the arguments don't fit the route" });
    }
  });
});

describe("with the album on, each read answers its own page", () => {
  waitsOn(["S9"], "the person page answers no-person for somebody who isn't a member", async () => {
    await definitionsStored(operations, onForEveryone(albumFlag.key));
    const { answerOf } = await websiteFor();

    expect(await answerOf("website.album.getAlbumPerson", { person: "m_nobody" })).toEqual({ kind: "no-person" });
  });

  waitsOn(["S9"], "the week page shows the week asked for, and this week when none is", async () => {
    await definitionsStored(operations, onForEveryone(albumFlag.key));
    const { answerOf } = await websiteFor();

    expect(await answerOf("website.album.getAlbumWeek", { week: "2026-11-02" })).toMatchObject({ kind: "week", week: "2026-11-02" });
    const thisWeek = (await answerOf("website.album.getAlbumWeek", {})) as { kind: string; week: string; thisWeek: string };
    expect(thisWeek.kind).toBe("week");
    expect(thisWeek.week).toBe(thisWeek.thisWeek);
  });

  waitsOn(["S9"], "the profile page answers a profile", async () => {
    await definitionsStored(operations, onForEveryone(albumFlag.key));
    const { answerOf } = await websiteFor();

    expect(await answerOf("website.album.getAlbumProfile", {})).toMatchObject({ kind: "profile" });
  });

  waitsOn(["S6"], "the book is not found while the unlock path leaves it out", async () => {
    const { answerOf } = await websiteFor();

    expect(await answerOf("website.book.getBook", {})).toEqual({ kind: "not-found" });
  });
});
