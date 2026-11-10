// The daily company profiles sync, ported from convex/companyProfiles/sync.test.ts: it reads posthog.com's team pages
// (the fake) and keeps every profile and team, and an older read that finishes late never overwrites a newer one.
import { asc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { aCutout, FakePostHogCom, type TeamPage } from "../../testing/fakePostHogCom.ts";
import { catalogue } from "../album/hoggies/catalogue.ts";
import { createClock } from "../clock.ts";
import { toDocument } from "../db/documents.ts";
import { companyProfiles as profilesTable } from "../db/schema/companyProfiles.ts";
import type { Doc } from "../db/schema/index.ts";
import type { Log } from "../log.ts";
import { createOperations, type Operations } from "../operations.ts";
import { syncCompanyProfiles as sync } from "./sync.ts";
import { companyTeamsOf } from "./teams.ts";

const wren = { id: 11, firstName: "Wren", lastName: "Halloway", colour: "lilac", cutout: aCutout("wren"), role: "Product Engineer" };
const oriel = { id: 12, firstName: "Oriel", lastName: "Pemberton", colour: "teal", cutout: aCutout("oriel"), role: "Designer" };
const tamsin = { id: 13, firstName: "Tamsin", lastName: "Quayle", colour: "red", cutout: aCutout("tamsin"), role: "Team Lead" };
const lanternCrest = "https://res.cloudinary.com/posthog-test/image/upload/v1/lantern_crest.png";
const lanternCrestSized = "https://res.cloudinary.com/posthog-test/image/upload/c_limit,w_160,f_auto,q_auto/v1/lantern_crest.png";
const lanterns: TeamPage = { slug: "lanterns", name: "Lanterns", crest: lanternCrest, leads: [tamsin.id], profiles: [tamsin, wren, oriel] };
const kites: TeamPage = { slug: "kites", name: "Kites", crest: null, leads: [oriel.id, wren.id], profiles: [oriel, wren] };
const monday = Date.UTC(2026, 9, 12, 6);
const hourMs = 60 * 60 * 1000;

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };

let postHogCom: FakePostHogCom;
let realNow: number;
let operations: Operations;

beforeEach(() => {
  postHogCom = new FakePostHogCom();
  vi.stubGlobal("fetch", (input: string | URL | Request) => postHogCom.fetch(input));
  realNow = monday;
  operations = createOperations({ pool: database.pool, clock: createClock({ real: () => realNow }), log: quiet });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function syncCompanyProfiles() {
  return operations.action("companyProfiles.sync.syncCompanyProfiles", (ctx) => sync(ctx, {}));
}

function companyTeams() {
  return operations.query("test.companyTeams", (ctx) => companyTeamsOf(ctx));
}

function companyProfiles() {
  return operations.query("test.companyProfiles", async (ctx) => {
    const rows = await ctx.tx.select().from(profilesTable).orderBy(asc(profilesTable._creationTime), asc(profilesTable._id));
    return rows.map((row) => toDocument<Doc<"companyProfiles">>(profilesTable, row)).map(({ profile, firstName, teams, role }) => ({ profile, firstName, teams, role }));
  });
}

describe("CV14: a company profile keeps its posthog.com ID, every team it is on and its role", () => {
  test("a person on two teams keeps both, in posthog.com's order, with their ID and role", async () => {
    postHogCom.withTeams(lanterns, kites);
    await syncCompanyProfiles();

    expect(await companyProfiles()).toEqual([
      { profile: tamsin.id, firstName: "Tamsin", teams: ["lanterns"], role: "Team Lead" },
      { profile: wren.id, firstName: "Wren", teams: ["lanterns", "kites"], role: "Product Engineer" },
      { profile: oriel.id, firstName: "Oriel", teams: ["lanterns", "kites"], role: "Designer" },
    ]);
  });

  test("a role is trimmed, and a blank or missing role is absent", async () => {
    postHogCom.withTeams({ ...kites, profiles: [{ ...oriel, role: "  Designer \n" }, { ...wren, role: "   " }, { ...tamsin, role: null }] });
    await syncCompanyProfiles();

    expect(await companyProfiles()).toEqual([
      { profile: oriel.id, firstName: "Oriel", teams: ["kites"], role: "Designer" },
      { profile: wren.id, firstName: "Wren", teams: ["kites"], role: undefined },
      { profile: tamsin.id, firstName: "Tamsin", teams: ["kites"], role: undefined },
    ]);
  });
});

describe("CV15: the sync keeps every company team with its name, crest, leads and people", () => {
  test("every team keeps its people and leads in posthog.com's order", async () => {
    postHogCom.withTeams(lanterns, kites);
    await syncCompanyProfiles();

    expect(await companyTeams()).toEqual([
      { team: "lanterns", name: "Lanterns", crest: { kind: "image", url: lanternCrestSized }, leads: [tamsin.id], people: [tamsin.id, wren.id, oriel.id] },
      { team: "kites", name: "Kites", crest: null, leads: [oriel.id, wren.id], people: [oriel.id, wren.id] },
    ]);
  });

  test("a team without a slug or a name is skipped, and its people are still kept as profiles on their other teams", async () => {
    postHogCom.withTeams({ ...lanterns, slug: null }, { ...kites, name: null }, { slug: "ferns", name: "Ferns", profiles: [wren] }, { slug: "moths", name: "  ", profiles: [tamsin] }, { slug: " ", name: "Wisps", profiles: [oriel] });
    await syncCompanyProfiles();

    expect(await companyTeams()).toEqual([{ team: "ferns", name: "Ferns", crest: null, leads: [], people: [wren.id] }]);
    expect(await companyProfiles()).toEqual([
      { profile: tamsin.id, firstName: "Tamsin", teams: [], role: "Team Lead" },
      { profile: wren.id, firstName: "Wren", teams: ["ferns"], role: "Product Engineer" },
      { profile: oriel.id, firstName: "Oriel", teams: [], role: "Designer" },
    ]);
  });

  test("a crest that isn't a Cloudinary image is dropped", async () => {
    postHogCom.withTeams({ ...lanterns, crest: "https://elsewhere.example/lantern_crest.png" }, { ...kites, crest: "https://res.cloudinary.com/posthog-test/image/upload/v1/kites.svg" });
    await syncCompanyProfiles();

    expect((await companyTeams()).map(({ crest }) => crest)).toEqual([null, null]);
  });

  test("a team gone from posthog.com is gone after the next good read", async () => {
    postHogCom.withTeams(lanterns, kites);
    await syncCompanyProfiles();
    postHogCom.withTeams(kites);
    await syncCompanyProfiles();

    expect((await companyTeams()).map(({ team }) => team)).toEqual(["kites"]);
  });

  test("an older sync that finishes after a newer one can't put its copy over the newer one", async () => {
    postHogCom.withTeams(lanterns);
    const olderRead = aHeldAnswer();
    postHogCom.answersPage(1, olderRead.answer);
    const olderSync = syncCompanyProfiles();
    await olderRead.asked;

    realNow = monday + hourMs;
    postHogCom.withTeams(kites).answersPage(1, (asPostHogComWould) => asPostHogComWould());
    await syncCompanyProfiles();
    olderRead.release();
    await olderSync;

    expect((await companyTeams()).map(({ team }) => team)).toEqual(["kites"]);
    expect((await companyProfiles()).map(({ firstName }) => firstName)).toEqual(["Oriel", "Wren"]);
  });
});

describe("CV16: a company team's crest art", () => {
  const catalogueCrest = catalogue.crests[0]!.crest;

  test("a team whose slug names a catalogue crest draws that crest, even with its own crest image", async () => {
    postHogCom.withTeams({ ...lanterns, slug: catalogueCrest });
    await syncCompanyProfiles();

    expect((await companyTeams())[0]?.crest).toEqual({ kind: "crest", slug: catalogueCrest });
  });

  test("a team the catalogue has no crest for draws its posthog.com crest image, else nothing", async () => {
    postHogCom.withTeams(lanterns, kites);
    await syncCompanyProfiles();

    expect((await companyTeams()).map(({ crest }) => crest)).toEqual([{ kind: "image", url: lanternCrestSized }, null]);
  });
});

function aHeldAnswer() {
  let release!: () => void;
  let wasAsked!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const asked = new Promise<void>((resolve) => (wasAsked = resolve));
  return {
    asked,
    release,
    answer: async (asPostHogComWould: () => Response) => {
      const answer = asPostHogComWould();
      wasAsked();
      await released;
      return answer;
    },
  };
}
