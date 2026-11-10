// The matcher's rules, CV17 of convex/companyProfiles/matcher.test.ts, at the matcher's own seam: the profiles come from
// a sync against the posthog.com fake, the links are written as the commands write them, and the members are the rows
// the directory would give. Settings, the link commands and faces (CV19 to CV21) wait on the directory and the website.
import { asc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { aCutout, FakePostHogCom, type TeamPageProfile } from "../../testing/fakePostHogCom.ts";
import { createClock } from "../clock.ts";
import { toDocument } from "../db/documents.ts";
import { companyProfileLinks } from "../db/schema/companyProfiles.ts";
import type { Doc } from "../db/schema/index.ts";
import type { Log } from "../log.ts";
import { createOperations, type Operations } from "../operations.ts";
import type { MemberId, MemberRows } from "../workspace/directory.ts";
import { insertLink, writeLink } from "./links.ts";
import { companyProfilesIn } from "./matcher.ts";
import { syncCompanyProfiles } from "./sync.ts";

const minute = 60 * 1000;

const wrenProfile = { id: 1, firstName: "Wren", lastName: "Halloway", colour: "lilac", cutout: aCutout("wren"), role: "Product Engineer" };
const orielProfile = { id: 2, firstName: "Oriel", lastName: "Pemberton", colour: "teal", cutout: aCutout("oriel") };
const samanthaProfile = { id: 3, firstName: "Samantha", lastName: "Okafor", colour: "orange", cutout: aCutout("samantha"), role: "  Team Lead  " };
const tamsinProfile = { id: 4, firstName: "Tamsin", lastName: "Vale", colour: null, cutout: null };

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };

let postHogCom: FakePostHogCom;
let realNow: number;
let operations: Operations;
let members: MemberRows;

beforeEach(async () => {
  postHogCom = new FakePostHogCom();
  vi.stubGlobal("fetch", (input: string | URL | Request) => postHogCom.fetch(input));
  realNow = Date.UTC(2026, 9, 16, 10);
  operations = createOperations({ pool: database.pool, clock: createClock({ real: () => realNow }), log: quiet });
  members = [];
  await onPostHogCom(wrenProfile, orielProfile, samanthaProfile, tamsinProfile);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function onPostHogCom(...people: TeamPageProfile[]) {
  const onGrowth = ({ id }: TeamPageProfile) => id === 2 || id === 3;
  const onAnalytics = ({ id }: TeamPageProfile) => id !== 3;
  postHogCom.withTeams({ slug: "analytics", name: "Analytics", profiles: people.filter(onAnalytics) }, { slug: "growth", name: "Growth", profiles: people.filter(onGrowth) });
  await operations.action("companyProfiles.sync.syncCompanyProfiles", (ctx) => syncCompanyProfiles(ctx, {}));
}

/** A member row as the directory keeps it; leaving and rejoining flip its kind, as Slack's member events do. */
function aTeammate(user: string, name: string) {
  const row = { _id: `member-${user}`, _creationTime: realNow, workspace: "T1", user, kind: "member", asOf: 0, name, realName: name, admin: false } as unknown as MemberRows[number];
  members.push(row);
  const member = row._id as MemberId;
  return {
    member,
    link: (profile: number) => anOwnLink(member, profile),
    leave: () => void ((row as { kind: string }).kind = "not-a-member"),
    rejoin: () => void ((row as { kind: string }).kind = "member"),
  };
}

async function matches() {
  return operations.query("test.matches", async (ctx) => {
    const { matches } = await companyProfilesIn(ctx, "T1", members);
    return [...matches.entries()].map(([member, { profile, by }]) => ({ member, profile: profile?.profile ?? null, by }));
  });
}

async function companyProfileOf({ member }: { member: MemberId }) {
  const match = (await matches()).find((one) => one.member === member);
  return { profile: match?.profile ?? null, by: match?.by ?? null };
}

function anAdminLink(member: MemberId, profile: number | null, setBy: MemberId) {
  return operations.mutation("test.anAdminLink", (ctx) => insertLink(ctx, { workspace: "T1", member, profile, by: "admin", setBy, at: ctx.now }));
}

function anOwnLink(member: MemberId, profile: number) {
  return operations.mutation("test.anOwnLink", (ctx) => insertLink(ctx, { workspace: "T1", member, profile, by: "self", setBy: member, at: ctx.now }));
}

function later() {
  realNow += minute;
}

describe("CV17: a profile is matched to at most one member, links first", () => {
  test("a member and a profile that are each the only one of their name match by name", async () => {
    const wren = aTeammate("U_WREN", "Wrén  HALLOWAY");

    expect(await companyProfileOf(wren)).toEqual({ profile: 1, by: "name" });
  });

  test("two members of one name match neither of them to the profile of that name", async () => {
    const wren = aTeammate("U_WREN", "Wren Halloway");
    const otherWren = aTeammate("U_WREN_TOO", "Wren Halloway");

    expect(await companyProfileOf(wren)).toEqual({ profile: null, by: null });
    expect(await companyProfileOf(otherWren)).toEqual({ profile: null, by: null });
  });

  test("two profiles of one name match neither of them to the member of that name", async () => {
    later();
    await onPostHogCom(wrenProfile, { ...wrenProfile, id: 5, cutout: aCutout("another-wren") }, orielProfile);
    const wren = aTeammate("U_WREN", "Wren Halloway");

    expect(await companyProfileOf(wren)).toEqual({ profile: null, by: null });
  });

  test("a self link matches an unmatched member", async () => {
    const sam = aTeammate("U_SAM", "Sam Okafor");
    await sam.link(3);

    expect(await companyProfileOf(sam)).toEqual({ profile: 3, by: "self" });
  });

  test("an admin link beats a self link and a name match", async () => {
    const sam = aTeammate("U_SAM", "Sam Okafor");
    await sam.link(2);
    const oriel = aTeammate("U_ORIEL", "Oriel Pemberton");
    const admin = aTeammate("U_ADMIN", "Ada Admin");
    await anAdminLink(admin.member, 2, admin.member);

    expect(await companyProfileOf(admin)).toEqual({ profile: 2, by: "admin" });
    expect(await companyProfileOf(sam)).toEqual({ profile: null, by: null });
    expect(await companyProfileOf(oriel)).toEqual({ profile: null, by: null });
    expect(await matches()).toEqual([{ member: admin.member, profile: 2, by: "admin" }]);
  });

  test("a name match never takes a profile an admin link gives to another member", async () => {
    const wren = aTeammate("U_WREN", "Wren Halloway");
    const oriel = aTeammate("U_ORIEL", "Oriel Pemberton");
    await anAdminLink(oriel.member, 1, oriel.member);

    expect(await companyProfileOf(oriel)).toEqual({ profile: 1, by: "admin" });
    expect(await companyProfileOf(wren)).toEqual({ profile: null, by: null });
  });

  test("an admin link to no profile unmatches a member the name match would match", async () => {
    const wren = aTeammate("U_WREN", "Wren Halloway");
    await anAdminLink(wren.member, null, wren.member);

    expect(await companyProfileOf(wren)).toEqual({ profile: null, by: "admin" });
    expect(await matches()).toEqual([{ member: wren.member, profile: null, by: "admin" }]);
  });

  test("a name match never takes a profile another member's self link holds", async () => {
    const sam = aTeammate("U_SAM", "Sam Okafor");
    await sam.link(1);
    const wren = aTeammate("U_WREN", "Wren Halloway");

    expect(await companyProfileOf(sam)).toEqual({ profile: 1, by: "self" });
    expect(await companyProfileOf(wren)).toEqual({ profile: null, by: null });
  });

  test("where two self links name one profile, the earlier holds it and the later member is unmatched", async () => {
    const sam = aTeammate("U_SAM", "Sam Okafor");
    const sammy = aTeammate("U_SAMMY", "Sammy Okafor");
    await sam.link(3);
    sam.leave();
    later();
    await sammy.link(3);
    sam.rejoin();

    expect(await companyProfileOf(sam)).toEqual({ profile: 3, by: "self" });
    expect(await companyProfileOf(sammy)).toEqual({ profile: null, by: null });
    expect(await matches()).toEqual([{ member: sam.member, profile: 3, by: "self" }]);
  });

  test("a returning member's old self link doesn't take a profile an admin link now gives to someone else", async () => {
    const sam = aTeammate("U_SAM", "Sam Okafor");
    const sammy = aTeammate("U_SAMMY", "Sammy Okafor");
    await sam.link(3);
    sam.leave();
    later();
    await anAdminLink(sammy.member, 3, sammy.member);
    sam.rejoin();

    expect(await companyProfileOf(sammy)).toEqual({ profile: 3, by: "admin" });
    expect(await companyProfileOf(sam)).toEqual({ profile: null, by: null });
  });

  test("the links of a member who left hold nothing while they are away", async () => {
    const sam = aTeammate("U_SAM", "Sam Okafor");
    await sam.link(1);
    sam.leave();
    const wren = aTeammate("U_WREN", "Wren Halloway");

    expect(await companyProfileOf(wren)).toEqual({ profile: 1, by: "name" });
    expect(await matches()).toEqual([{ member: wren.member, profile: 1, by: "name" }]);
  });

  test("a self link to a profile gone from posthog.com holds nothing until the profile returns", async () => {
    const sam = aTeammate("U_SAM", "Sam Okafor");
    await sam.link(3);
    later();
    await onPostHogCom(wrenProfile, orielProfile, tamsinProfile);

    expect(await companyProfileOf(sam)).toEqual({ profile: null, by: null });

    later();
    await onPostHogCom(wrenProfile, orielProfile, samanthaProfile, tamsinProfile);

    expect(await companyProfileOf(sam)).toEqual({ profile: 3, by: "self" });
  });

  test("a later own link that an earlier one holds leaves its member unmatched, even where their name would match", async () => {
    const sam = aTeammate("U_SAM", "Sam Okafor");
    await sam.link(3);
    const wren = aTeammate("U_WREN", "Wren Halloway");
    later();
    await anOwnLink(wren.member, 3);

    expect(await companyProfileOf(wren)).toEqual({ profile: null, by: null });
    expect(await matches()).toEqual([{ member: sam.member, profile: 3, by: "self" }]);
  });

  test("an own link to a profile gone from posthog.com leaves its member unmatched, even where their name would match", async () => {
    const wren = aTeammate("U_WREN", "Wren Halloway");
    await anOwnLink(wren.member, 3);
    later();
    await onPostHogCom(wrenProfile, orielProfile, tamsinProfile);

    expect(await companyProfileOf(wren)).toEqual({ profile: null, by: null });
  });

  test("a member's admin link beats their own link, to another profile or to none", async () => {
    const sam = aTeammate("U_SAM", "Sam Okafor");
    await sam.link(3);
    await anAdminLink(sam.member, 4, sam.member);

    expect(await matches()).toEqual([{ member: sam.member, profile: 4, by: "admin" }]);

    await operations.mutation("test.adminChoosesNone", async (ctx) => {
      const rows = await ctx.tx.select().from(companyProfileLinks).orderBy(asc(companyProfileLinks._creationTime), asc(companyProfileLinks._id));
      for (const link of rows.map((row) => toDocument<Doc<"companyProfileLinks">>(companyProfileLinks, row))) if (link.by === "admin") await writeLink(ctx, { ...link, profile: null });
    });

    expect(await matches()).toEqual([{ member: sam.member, profile: null, by: "admin" }]);
  });

  test("an admin link to a profile gone from posthog.com leaves its member unmatched by the admin's decision", async () => {
    const wren = aTeammate("U_WREN", "Wren Halloway");
    await anAdminLink(wren.member, 3, wren.member);
    later();
    await onPostHogCom(wrenProfile, orielProfile, tamsinProfile);

    expect(await companyProfileOf(wren)).toEqual({ profile: null, by: "admin" });
  });
});
