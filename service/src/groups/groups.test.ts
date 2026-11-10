// Groups on the service's transaction: primary groups and their history, reconciliation over the transition log,
// attribution, the group mode and picking a group. These reach no other stack's body; the Slack-level ports of
// convex/groups/*.test.ts that do wait on those stacks.
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { definitionsStored, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import type { KudosGivenEvent } from "../bus/events.ts";
import { subscribersOf, type Subscription } from "../bus/publish.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import { toDocument } from "../db/documents.ts";
import { jobs } from "../db/schema/index.ts";
import { mutationJob } from "../jobs/define.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext, type QueryContext } from "../operations.ts";
import type { MemberId, People } from "../workspace/directory.ts";
import { userGroupsOf } from "../workspace/userGroups.ts";
import { attributeKudosGiven } from "./attribution.ts";
import { groupModeShownTo, setGroupMode } from "./groupMode.ts";
import { availableIn, countingGroupsOf, countingGroupsWithPeopleIn, countingPrimaryGroupOf, primaryGroupOf, primaryMembersOf, type GroupId } from "./groups.ts";
import { primaryGroupAt, recordChange } from "./history.ts";
import { groupChoiceOf, pickPrimaryGroup } from "./pick.ts";
import { reconcileLater, reconcileMember, reconcileUser, reconcileUsers, reconcileWorkspace } from "./reconcile.ts";
import { recordCountingChange, recordDepartures } from "./transitions.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const start = Date.parse("2026-10-13T10:00:00Z");
const minute = 60_000;

// The one setup of this file: the operation runner on the test database at a clock the test moves, the seeder, and
// the events the code under test published, read back from the jobs a recording subscriber got. S4's in-process
// backend replaces it.
const recorder = mutationJob("test.published", z.object({ event: z.looseObject({ type: z.string() }) }), async () => {});
function backend() {
  let now = start;
  const clock = createClock({ real: () => now });
  const subscriptions = ["primaryGroupChanged", "awardsAttributed"].map((event) => ({ event, job: recorder })) as Subscription<any>[];
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1, subscribers: subscribersOf(subscriptions) });
  const seed = seeder(operations);
  const scheduled = (name: string) =>
    operations.query("test.scheduled", async ({ tx }) => {
      const rows = await tx.select().from(jobs).where(eq(jobs.name, name)).orderBy(asc(jobs._creationTime), asc(jobs._id));
      return rows.map((row) => toDocument<{ name: string; args: Record<string, unknown> }>(jobs, row).args);
    });
  const slackIds = new Map<GroupId, string>();
  return {
    operations,
    seed,
    at: (instant: number) => void (now = instant),
    mutation: <T>(handler: (ctx: MutationContext) => Promise<T>) => operations.mutation("test.mutation", handler),
    query: <T>(handler: (ctx: QueryContext) => Promise<T>) => operations.query("test.query", handler),
    scheduled,
    published: async (type: string) => ((await scheduled(recorder.name)) as Array<{ event: { type: string } }>).map(({ event }) => event).filter((event) => event.type === type),
    member: (user: string, extra: { admin?: boolean; kind?: "member" | "not-a-member" } = {}) =>
      seed.insert("members", { workspace: "T1", user, kind: extra.kind ?? "member", ...(extra.admin !== undefined && { admin: extra.admin }) }) as Promise<MemberId>,
    async group(group: string, name: string, members: number, extra: { enabled?: boolean; automatic?: boolean } = {}): Promise<GroupId> {
      const id = (await seed.insert("userGroups", { workspace: "T1", group, handle: name.toLowerCase(), name, enabled: extra.enabled ?? true, automatic: extra.automatic ?? false, members, asOf: start })) as GroupId;
      slackIds.set(id, group);
      return id;
    },
    joins: (group: string, user: string, at = now) => seed.insert("userGroupMembers", { workspace: "T1", group, user, _creationTime: at }),
    /** Slack's copy dropping the user from the group at the instant, as the user group sync records it. */
    async leaves(group: GroupId, user: string, at: number) {
      const memberships = (await seed.all("userGroupMembers")).filter((row) => row.user === user && row.group === slackIds.get(group));
      for (const membership of memberships) await seed.delete("userGroupMembers", membership._id);
      const row = (await seed.get("userGroups", group))!;
      await operations.mutation("test.leaves", (ctx) => recordDepartures(ctx, row, memberships, at));
    },
    history: async (member: MemberId) =>
      (await seed.all("primaryGroupHistory")).filter((entry) => entry.member === member).map(({ from, group, cause, at }) => ({ from, group, cause, at })),
  };
}

/** Ann in Ants (five people) and Owls (two), Bob in Ants only. */
async function annAndBob() {
  const t = backend();
  const ann = await t.member("U_ANN");
  const bob = await t.member("U_BOB");
  const ants = await t.group("S_ANTS", "Ants", 5);
  const owls = await t.group("S_OWLS", "Owls", 2);
  await t.joins("S_ANTS", "U_ANN");
  await t.joins("S_OWLS", "U_ANN");
  await t.joins("S_ANTS", "U_BOB");
  return { t, ann, bob, ants, owls };
}

function kudosGiven(giver: MemberId, recipients: MemberId[], extra: Partial<KudosGivenEvent> = {}): KudosGivenEvent {
  return {
    type: "kudosGiven",
    workspace: "T1",
    message: { workspace: "T1", conversation: "C1", message: "1760349600.000100" },
    giver,
    awards: recipients.map((recipient) => ({ award: `award-${recipient}` as Id<"awards">, giver, recipient, kudos: 1 })),
    via: "message",
    kudosEmoji: "taco",
    annotations: {},
    allowance: { dailyOpening: 3, dailyLeft: 2 },
    skippedMentions: 0,
    retry: false,
    inThread: false,
    day: "2026-10-13",
    at: start,
    ...extra,
  };
}

describe("GB6: a member gets the smallest of their counting groups as primary group, and keeps it", () => {
  test("a member in two groups counts for the one with fewer members, whatever its name, and their groups list both by name", async () => {
    const { t, ann, ants, owls } = await annAndBob();

    await t.mutation((ctx) => reconcileMember(ctx, ann));

    expect(await t.query((ctx) => primaryGroupOf(ctx, ann))).toEqual({ group: owls, name: "Owls" });
    expect(await t.query((ctx) => countingGroupsOf(ctx, ann))).toEqual([
      { group: ants, name: "Ants" },
      { group: owls, name: "Owls" },
    ]);
    expect(await t.history(ann)).toEqual([{ from: null, group: owls, cause: "default", at: start }]);
    expect(await t.published("primaryGroupChanged")).toEqual([expect.objectContaining({ member: ann, from: null, to: owls, cause: "default", at: start })]);
  });

  test("a smaller group joined later doesn't move the primary group, and reconciling again records nothing", async () => {
    const { t, ann, owls } = await annAndBob();
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    await t.group("S_BEES", "Bees", 1);
    await t.joins("S_BEES", "U_ANN", start + minute);
    t.at(start + 2 * minute);
    await t.mutation((ctx) => reconcileMember(ctx, ann));
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    expect(await t.query((ctx) => primaryGroupOf(ctx, ann))).toEqual({ group: owls, name: "Owls" });
    expect(await t.history(ann)).toHaveLength(1);
    expect((await t.query((ctx) => countingGroupsOf(ctx, ann))).map(({ name }) => name)).toEqual(["Ants", "Bees", "Owls"]);
  });
});

describe("GB8, GB9: a member who loses their primary group falls back to the smallest group left, at the instant they lost it", () => {
  test("leaving the primary group in Slack, reconciled later, moves the member at the instant the copy recorded", async () => {
    const { t, ann, ants, owls } = await annAndBob();
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    await t.leaves(owls, "U_ANN", start + minute);
    t.at(start + 10 * minute);
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    expect(await t.history(ann)).toEqual([
      { from: null, group: owls, cause: "default", at: start },
      { from: owls, group: ants, cause: "fallback", at: start + minute },
    ]);
    expect(await t.query((ctx) => primaryGroupAt(ctx, ann, start + minute - 1))).toBe(owls);
    expect(await t.query((ctx) => primaryGroupAt(ctx, ann, start + minute))).toBe(ants);
    expect(await t.query((ctx) => primaryMembersOf(ctx, ants))).toEqual([ann]);
  });

  test("the primary group disabled in Slack stops counting, and its members fall back at the instant it stopped", async () => {
    const { t, ann, ants, owls } = await annAndBob();
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    await t.seed.patch("userGroups", owls, { enabled: false });
    const disabled = (await t.seed.get("userGroups", owls))!;
    await t.mutation((ctx) => recordCountingChange(ctx, disabled, false, start + minute));
    t.at(start + 10 * minute);
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    expect((await t.history(ann)).at(-1)).toEqual({ from: owls, group: ants, cause: "fallback", at: start + minute });
    expect(await t.query((ctx) => countingGroupsOf(ctx, ann))).toEqual([{ group: ants, name: "Ants" }]);
  });

  test("a removal and a re-add recorded before the member's page runs leaves the fallback in between in the history", async () => {
    const { t, ann, ants, owls } = await annAndBob();
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    await t.leaves(owls, "U_ANN", start + minute);
    await t.joins("S_OWLS", "U_ANN", start + 2 * minute);
    t.at(start + 10 * minute);
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    expect(await t.history(ann)).toEqual([
      { from: null, group: owls, cause: "default", at: start },
      { from: owls, group: ants, cause: "fallback", at: start + minute },
    ]);
    expect(await t.query((ctx) => primaryGroupOf(ctx, ann))).toEqual({ group: ants, name: "Ants" });
  });

  test("a member whose last group leaves counts for no group", async () => {
    const { t, bob, ants } = await annAndBob();
    await t.mutation((ctx) => reconcileMember(ctx, bob));

    await t.leaves(ants, "U_BOB", start + minute);
    t.at(start + 10 * minute);
    await t.mutation((ctx) => reconcileMember(ctx, bob));

    expect(await t.history(bob)).toEqual([
      { from: null, group: ants, cause: "default", at: start },
      { from: ants, group: null, cause: "fallback", at: start + minute },
    ]);
    expect(await t.query((ctx) => primaryGroupOf(ctx, bob))).toBeNull();
    expect(await t.query((ctx) => countingGroupsOf(ctx, bob))).toEqual([]);
  });

  test("a deactivated member counts for no group from the instant the directory recorded it", async () => {
    const { t, ann, owls } = await annAndBob();
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    await t.seed.patch("members", ann, { kind: "not-a-member" });
    t.at(start + 10 * minute);
    await t.mutation((ctx) => reconcileUser(ctx, "T1", "U_ANN", start + 5 * minute));

    expect((await t.history(ann)).at(-1)).toEqual({ from: owls, group: null, cause: "fallback", at: start + 5 * minute });
    expect(await t.seed.all("memberGroups")).toEqual([expect.objectContaining({ member: ann, groups: [], primary: null, directoryChangedAt: start + 5 * minute })]);
  });
});

describe("GB9: primaryGroupAt answers the history entry in force at an instant", () => {
  test("of two changes recorded in the same millisecond, the later one is in force at it, and a change is never dated before the latest", async () => {
    const { t, ann, ants, owls } = await annAndBob();
    const person = (await t.seed.get("members", ann))!;

    await t.mutation((ctx) => recordChange(ctx, person, null, owls, "default", start));
    await t.mutation((ctx) => recordChange(ctx, person, owls, ants, "picked", start));
    await t.mutation((ctx) => recordChange(ctx, person, ants, owls, "picked", start - minute));

    expect(await t.query((ctx) => primaryGroupAt(ctx, ann, start - 1))).toBeNull();
    expect((await t.history(ann)).map(({ at }) => at)).toEqual([start, start, start]);
    expect(await t.query((ctx) => primaryGroupAt(ctx, ann, start))).toBe(owls);
  });
});

describe("GB35: reconciliation runs in pages", () => {
  test("reconciling users later schedules pages of 100, sorted", async () => {
    const t = backend();
    const users = Array.from({ length: 250 }, (_, i) => `U${String(249 - i).padStart(3, "0")}`);

    await t.mutation((ctx) => reconcileLater(ctx, "T1", users));

    const pages = (await t.scheduled("groups.reconcile.reconcileUsers")) as Array<{ workspace: string; users: string[] }>;
    expect(pages.map(({ users }) => users.length)).toEqual([100, 100, 50]);
    expect(pages.flatMap(({ users }) => users)).toEqual(users.toSorted());
  });

  test("a page of users reconciles only the users it names", async () => {
    const { t, ann, bob, owls } = await annAndBob();

    await t.mutation((ctx) => reconcileUsers(ctx, { workspace: "T1", users: ["U_ANN"] }));

    expect(await t.query((ctx) => primaryGroupOf(ctx, ann))).toEqual({ group: owls, name: "Owls" });
    expect(await t.query((ctx) => primaryGroupOf(ctx, bob))).toBeNull();
  });

  test("reconciling the workspace takes 100 members a page and hands the rest to the next page", async () => {
    const t = backend();
    await t.group("S_ANTS", "Ants", 101);
    for (let i = 0; i < 101; i++) {
      const user = `U${String(i).padStart(3, "0")}`;
      await t.member(user);
      await t.joins("S_ANTS", user);
    }

    await t.mutation((ctx) => reconcileWorkspace(ctx, { workspace: "T1" }));
    expect(await t.scheduled("groups.reconcile.reconcileWorkspace")).toEqual([{ workspace: "T1", after: "U099" }]);
    expect(await t.seed.all("memberGroups")).toHaveLength(100);

    await t.mutation((ctx) => reconcileWorkspace(ctx, { workspace: "T1", after: "U099" }));
    expect(await t.seed.all("memberGroups")).toHaveLength(101);
    expect(await t.scheduled("groups.reconcile.reconcileWorkspace")).toHaveLength(1);
  });
});

describe("GB10: a kudos message counts for the giver's primary group at its spend instant", () => {
  test("the attribution names the giver's group, each recipient's group and whether the kudos says why, and is published once", async () => {
    const { t, ann, bob, ants, owls } = await annAndBob();
    const event = kudosGiven(ann, [bob], { annotations: { gate: { version: 1, thoughtful: true } } });

    await t.mutation((ctx) => attributeKudosGiven(ctx, { event }));
    await t.mutation((ctx) => attributeKudosGiven(ctx, { event }));

    const expected = {
      workspace: "T1",
      giver: ann,
      group: owls,
      kudos: 1,
      day: "2026-10-13",
      at: start,
      awards: [{ award: `award-${bob}`, recipient: bob, kudos: 1, saysWhy: true, recipientGroup: ants }],
    };
    expect(await t.seed.all("attributions")).toEqual([expect.objectContaining({ conversation: "C1", message: "1760349600.000100", ...expected })]);
    expect(await t.published("awardsAttributed")).toEqual([expect.objectContaining({ type: "awardsAttributed", message: event.message, ...expected })]);
  });

  test("a pick saved after the spend doesn't move the kudos: the history at the spend instant wins", async () => {
    const { t, ann, bob, ants, owls } = await annAndBob();
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    t.at(start + minute);
    expect(await t.mutation((ctx) => pickPrimaryGroup(ctx, ann, ants))).toBe("picked");
    await t.mutation((ctx) => attributeKudosGiven(ctx, { event: kudosGiven(ann, [bob]) }));

    expect((await t.seed.all("attributions")).map(({ group }) => group)).toEqual([owls]);
  });

  test("a giver without a counting group counts for no group", async () => {
    const t = backend();
    const ann = await t.member("U_ANN");
    const bob = await t.member("U_BOB");

    await t.mutation((ctx) => attributeKudosGiven(ctx, { event: kudosGiven(ann, [bob]) }));

    expect(await t.seed.all("attributions")).toEqual([expect.objectContaining({ group: null, awards: [expect.objectContaining({ recipientGroup: null, saysWhy: false })] })]);
  });

  test("a message naming more people than a page reconciles hands the rest to the next run and attributes once all are reconciled", async () => {
    const t = backend();
    const ann = await t.member("U_ANN");
    const recipients: MemberId[] = [];
    for (let i = 0; i < 120; i++) recipients.push(await t.member(`U${String(i).padStart(3, "0")}`));
    const event = kudosGiven(ann, recipients);

    await t.mutation((ctx) => attributeKudosGiven(ctx, { event }));

    const [next] = (await t.scheduled("groups.attribution.attributeKudosGiven")) as Array<{ unreconciled: MemberId[] }>;
    expect(next?.unreconciled).toHaveLength(21);
    expect(await t.seed.all("attributions")).toEqual([]);

    await t.mutation((ctx) => attributeKudosGiven(ctx, { event, unreconciled: next!.unreconciled }));
    expect(await t.seed.all("attributions")).toHaveLength(1);
  });
});

describe("GB1, GB3: groups are available only where an enabled custom group counts", () => {
  test("a workspace whose only groups are disabled or automatic has no groups; one custom group makes them available", async () => {
    const t = backend();
    await t.group("S_OFF", "Off", 3, { enabled: false });
    await t.group("S_ADMINS", "Admins", 3, { automatic: true });

    expect(await t.query((ctx) => availableIn(ctx, "T1"))).toBe(false);

    await t.group("S_OWLS", "Owls", 3);
    expect(await t.query((ctx) => availableIn(ctx, "T1"))).toBe(true);
  });

  test("the counting groups list their current members, leaving out former ones and users the directory doesn't know", async () => {
    const { t, ann, bob, ants } = await annAndBob();
    await t.joins("S_ANTS", "U_STRANGER");
    const people: People = new Map([
      [ann, { user: "U_ANN", name: "Ann", picture: null, former: false }],
      [bob, { user: "U_BOB", name: "Bob", picture: null, former: true }],
    ]);

    const groups = await t.query((ctx) => countingGroupsWithPeopleIn(ctx, "T1", people));

    expect(groups).toEqual([
      { group: ants, name: "Ants", people: [ann] },
      { group: expect.any(String), name: "Owls", people: [ann] },
    ]);
  });

  test("a user's groups are the kept ones, by handle", async () => {
    const { t } = await annAndBob();
    await t.group("S_OFF", "Aardvarks", 3, { enabled: false });
    await t.joins("S_OFF", "U_ANN");

    expect(await t.query((ctx) => userGroupsOf(ctx, "T1", "U_ANN"))).toEqual([
      { group: "S_ANTS", handle: "ants", name: "Ants" },
      { group: "S_OWLS", handle: "owls", name: "Owls" },
    ]);
  });
});

describe("the group picker: a member picks their primary group among their counting groups", () => {
  test("picking one of my groups records it, picking it again keeps it, and a group I'm not in is refused", async () => {
    const { t, ann, ants, owls } = await annAndBob();
    const bees = await t.group("S_BEES", "Bees", 1);

    t.at(start + minute);
    expect(await t.mutation((ctx) => pickPrimaryGroup(ctx, ann, ants))).toBe("picked");
    expect(await t.mutation((ctx) => pickPrimaryGroup(ctx, ann, ants))).toBe("kept");
    expect(await t.mutation((ctx) => pickPrimaryGroup(ctx, ann, bees))).toBe("refused");

    expect(await t.history(ann)).toEqual([
      { from: null, group: owls, cause: "default", at: start },
      { from: owls, group: ants, cause: "picked", at: start + minute },
    ]);
    expect(await t.query((ctx) => groupChoiceOf(ctx, ann))).toEqual({
      primary: { group: ants, name: "Ants" },
      groups: [
        { group: ants, name: "Ants" },
        { group: owls, name: "Owls" },
      ],
    });
  });
});

describe("GB27, GB1, GB8, GB26: the group mode", () => {
  beforeEach(() => void postHogDeciding("sandbox"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function adminsAndGroups(groups = onForEveryone("groups")) {
    const setup = await annAndBob();
    const { t } = setup;
    await definitionsStored(t.operations, groups);
    const admin = await t.member("U_ADMIN", { admin: true });
    return { ...setup, admin: { member: admin, admin: true } };
  }

  test("an admin where `groups` applies sees every kept group, by name, with every group counting", async () => {
    const { t, admin, ants, owls } = await adminsAndGroups();
    await t.group("S_OFF", "Off", 3, { enabled: false });

    expect(await t.mutation((ctx) => groupModeShownTo(ctx, "T1", admin))).toEqual({
      mode: "all",
      groups: [
        { group: ants, name: "Ants" },
        { group: owls, name: "Owls" },
      ],
      allowlist: [],
    });
  });

  test("a member who isn't an admin, or an admin to whom `groups` doesn't apply, neither sees nor sets the group mode", async () => {
    const off = await adminsAndGroups(offForEveryone("groups"));
    expect(await off.t.mutation((ctx) => groupModeShownTo(ctx, "T1", off.admin))).toBeNull();
    expect(await off.t.mutation((ctx) => setGroupMode(ctx, "T1", off.admin, { mode: "allowlist", allowlist: [] }))).toBe(false);

    const on = await adminsAndGroups();
    const notAdmin = { member: on.ann, admin: false };
    expect(await on.t.mutation((ctx) => groupModeShownTo(ctx, "T1", notAdmin))).toBeNull();
    expect(await on.t.mutation((ctx) => setGroupMode(ctx, "T1", notAdmin, { mode: "allowlist", allowlist: [] }))).toBe(false);
    expect(await on.t.seed.all("groupSettings")).toEqual([]);
  });

  test("switching to Only these groups starts with every group picked, so the switch alone changes nobody's group", async () => {
    const { t, admin, ants, owls } = await adminsAndGroups();

    expect(await t.mutation((ctx) => setGroupMode(ctx, "T1", admin, { mode: "allowlist" }))).toBe(true);

    expect(await t.seed.all("groupSettings")).toEqual([expect.objectContaining({ mode: "allowlist", allowlist: [ants, owls] })]);
    expect(await t.seed.all("groupCountingChanges")).toEqual([]);
    expect(await t.scheduled("groups.reconcile.reconcileWorkspace")).toEqual([]);
  });

  test("picking one group stops the other counting at the switch, and reconciling moves its members to the group left", async () => {
    const { t, admin, ann, ants, owls } = await adminsAndGroups();
    await t.mutation((ctx) => reconcileMember(ctx, ann));

    t.at(start + minute);
    await t.mutation((ctx) => setGroupMode(ctx, "T1", admin, { mode: "allowlist", allowlist: [ants] }));
    expect(await t.seed.all("groupCountingChanges")).toEqual([expect.objectContaining({ group: owls, counts: false, at: start + minute })]);
    expect(await t.scheduled("groups.reconcile.reconcileWorkspace")).toEqual([{ workspace: "T1" }]);
    expect(await t.query((ctx) => countingPrimaryGroupOf(ctx, ann))).toBeNull();

    t.at(start + 2 * minute);
    await t.mutation((ctx) => reconcileWorkspace(ctx, { workspace: "T1" }));
    expect((await t.history(ann)).at(-1)).toEqual({ from: owls, group: ants, cause: "fallback", at: start + minute });
    expect(await t.query((ctx) => countingPrimaryGroupOf(ctx, ann))).toEqual({ group: ants, name: "Ants" });

    t.at(start + 3 * minute);
    await t.mutation((ctx) => setGroupMode(ctx, "T1", admin, { mode: "all" }));
    await t.mutation((ctx) => setGroupMode(ctx, "T1", admin, { mode: "allowlist" }));
    expect(await t.seed.all("groupSettings")).toEqual([expect.objectContaining({ mode: "allowlist", allowlist: [ants] })]);
  });
});
