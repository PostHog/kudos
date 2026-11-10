// Picking an avatar on the website: today's convex/website/setAvatar.test.ts, on the service's test backend. The pick
// runs settingsCommands.ts's `setAvatar` for a `me` made from the seeded directory row and a `person` the directory
// answers, as S15's member check answers them. The picks whose subject is the member check or the route's arguments
// (closed, signed out, not a member, a call naming a member) go through S15's route transport in S17's route pull
// request. Today's scheduled functions are the jobs table's rows.
import { asc, getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { achievementsLiveIn } from "../achievements/flag.ts";
import { catalogue, hoggieNamed } from "../album/hoggies/catalogue.ts";
import { earnLevelUpHoggies } from "../album/levelUpHoggies.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import { toDocument } from "../db/documents.ts";
import * as schema from "../db/schema/index.ts";
import * as loadTables from "../db/schema/load.ts";
import * as serviceTables from "../db/schema/service.ts";
import type { HomeMember } from "../feedback/homes.ts";
import type { Feature } from "../unlocks/feature.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { setAvatar as setAvatarCommand } from "./settingsCommands.ts";

const allowedWorkspace = "T1";
const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const avatarFlags = ["xp-levels", "unlocks", "achievements", "collection", "hoggie-avatar"];

// A member holding a hoggie: the unlocks and the Book shipped and opened (S6), a level reached with its level-up hoggies
// (S10); then the pick: the launch guard (S15), the command runner (S4), the avatar (S10) and App Home's republish (S5, S17).
const holdingAndPicking: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S10", "S15", "S17"];

type Row = Record<string, unknown>;

const backend = useTestBackend({ now: now.getTime(), workspace: allowedWorkspace });

let t: TestBackend;

beforeEach(() => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", allowedWorkspace);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  t = backend();
});

afterEach(() => void vi.unstubAllEnvs());

// Today's `switchWebsite(t, postHog, true, ...keys)`: the website open, these flags on for everyone, and the workspace's key made.
async function flagsOn(...keys: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...keys.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
}

async function aMemberHoldingRocket() {
  await flagsOn(...avatarFlags.filter((flag) => flag !== "collection"));
  await bookShippedBeforeAnyoneJoined();
  const member = (await t.seed.insert("members", { workspace: allowedWorkspace, user: juno.user, kind: "member", asOf: 0 })) as MemberId;
  const me = await signedIn(member);
  await reachesLevel(member, 4);
  await opens(member, "book");
  await holds(member, "rocket");
  await flagsOn(...avatarFlags);
  return { member, me };
}

/** Today's `aSignedInSession`: the users row and analytics ID, and the member check's answer for the member. */
async function signedIn(member: MemberId): Promise<VerifiedMember> {
  await t.seed.insert("users", { name: juno.name, chatIdentity: { workspace: allowedWorkspace, user: juno.user } });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, workspace: allowedWorkspace, user: juno.user, name: juno.name };
}

async function bookShippedBeforeAnyoneJoined() {
  await t.run((ctx) => unlocksLiveIn(ctx, allowedWorkspace));
  await t.run((ctx) => achievementsLiveIn(ctx, allowedWorkspace));
  await t.settle();
}

// Today's `reachesLevel`: the levelReached event, through unlocks' `makeReady` and `earnLevelUpHoggies`.
async function reachesLevel(member: MemberId, level: number) {
  const message = { workspace: allowedWorkspace, conversation: "C1", message: `level-${level}-${member}` };
  const event: LevelReachedEvent = { type: "levelReached", workspace: allowedWorkspace, member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at: t.clock.now() };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
}

async function opens(member: MemberId, feature: Feature) {
  expect(await t.run((ctx) => openUnlock(ctx, member, feature, "slack"))).toBe("done");
}

// Today's testing/hoggies.ts `holds`: a drop of each hoggie, with the member's drop and hoggie tallies.
async function holds(member: MemberId, ...hoggies: string[]) {
  for (const hoggie of hoggies) {
    const tally = (await t.seed.all("dropTallies")).find((row) => row.member === member);
    const n = (tally?.drops ?? 0) + 1;
    if (tally === undefined) await t.seed.insert("dropTallies", { member, drops: n });
    else await t.seed.patch("dropTallies", tally._id, { drops: n });
    const at = t.clock.now();
    const held = (await t.seed.all("hoggieTallies")).find((row) => row.member === member && row.hoggie === hoggie);
    const copy = (held?.count ?? 0) + 1;
    await t.seed.insert("drops", { member, crate: `test:held:${n}`, hoggie, rarity: hoggieNamed(hoggie)!.rarity, n, copy, catalogueVersion: catalogue.version, at, crest: null });
    if (held === undefined) await t.seed.insert("hoggieTallies", { member, hoggie, count: copy, firstAt: at, firstN: n });
    else await t.seed.patch("hoggieTallies", held._id, { count: copy });
  }
}

/** Runs the pick as the website's route does: the member check's `me`, and the directory's facts of them. */
function setAvatar(me: VerifiedMember, hoggie: string | null) {
  return t.run(async (ctx) => setAvatarCommand(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, { hoggie }));
}

const everyTable = (Object.values(schema) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).sort((a, b) => getTableName(a).localeCompare(getTableName(b)));
// The service's own tables: none of them is one of today's `schema.tables`.
const servicesOwn = new Set((Object.values({ ...serviceTables, ...loadTables }) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).map(getTableName));

/** Every table's rows, today's tables and scheduled functions (the jobs) both, each in an explicit order; the service's own as stored. */
function everythingWritten(): Promise<Record<string, Row[]>> {
  return t.query(async ({ tx }) => {
    const rows: Record<string, Row[]> = {};
    for (const table of everyTable) {
      const columns = getTableColumns(table);
      const order = columns._creationTime && columns._id ? [columns._creationTime, columns._id] : Object.values(columns);
      rows[getTableName(table)] = (await tx.select().from(table).orderBy(...order.map((column) => asc(column)))).map((row) => (servicesOwn.has(getTableName(table)) ? row : toDocument<Row>(table, row)));
    }
    return rows;
  });
}

describe("a website command never launches unlocks", () => {
  waitsOn(holdingAndPicking, "WS62 P77: with no unlocks launch recorded, setting an avatar answers refused and launches nothing", async () => {
    const { me } = await aMemberHoldingRocket();
    for (const launch of await t.seed.all("unlockLaunches")) await t.seed.delete("unlockLaunches", launch._id);
    const before = await everythingWritten();

    expect(await setAvatar(me, "rocket")).toEqual({ kind: "refused" });
    expect(await everythingWritten()).toEqual(before);
  });
});
