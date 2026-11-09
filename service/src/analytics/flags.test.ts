// The flag seam on the operation's definitions snapshot. The first describes port today's convex/analytics/flags.test.ts
// (O31, O33, O34, F12 to F15, O36 and the oldest analytics ID), so the rewrite decides as today does; the rest prove what
// the rewrite adds: one read of the definitions per operation attempt, through its own transaction, and no network.
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { failsToConnect, flagsKey, routedFetch, type FakePostHog, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { definitionsStored, flagsFromPostHog, onForEmails, onForEveryone, onForPercent, onInTheSandboxOnly, postHogDeciding, variantForEveryone } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext, type QueryContext } from "../operations.ts";
import { exposed, flagSeamCheck, memberDecision, memberDecisionBeforeWriting, memberDecisionWithoutWriting, workspaceDecision, workspaceDecisionWithoutWriting, type Flag } from "./flags.ts";
import { workspaceKeyOf } from "./outbox.ts";
import { analyticsIdOf, existingAnalyticsId } from "./person.ts";

type MemberId = Id<"members">;

const database = useTestDatabase();
const quiet: Log = { info() {}, error() {} };
const clock = createClock({ real: () => Date.parse("2026-11-09T10:00:00Z") });

// Every statement the runner sends that reads the definitions row, counted on the pool's connections.
let definitionReads = 0;
const counting: Pick<pg.Pool, "connect"> = {
  async connect() {
    const client = await database.pool.connect();
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    return Object.assign(Object.create(client), {
      query: (...args: unknown[]) => {
        const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string }).text;
        if (text?.includes('from "flagDefinitions"')) definitionReads += 1;
        return query(...args);
      },
    }) as pg.PoolClient;
  },
};
const operations = createOperations({ pool: counting, clock, log: quiet, retryDelayMs: () => 1 });
const seed = seeder(operations);

const boardFlag = { key: "everyone-board", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
const layoutFlag = { key: "board-layout", safeDefault: "control", values: ["control", "compact"] } as const satisfies Flag<"control" | "compact">;
const inACohort = (key: string): FlagDefinition => ({ key, filters: { groups: [{ properties: [{ key: "id", type: "cohort", value: 7 }], rollout_percentage: 100 }] } });

let postHog: FakePostHog;

beforeEach(() => {
  definitionReads = 0;
  postHog = postHogDeciding("sandbox");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const aMember = (user = "U_ALICE", email?: string) => seed.insert("members", { workspace: "T1", user, kind: "member", ...(email !== undefined && { email }) });
const load = (...definitions: FlagDefinition[]) => flagsFromPostHog(operations, postHog, ...definitions);
const inMutation = <T>(decide: (ctx: MutationContext) => Promise<T>) => operations.mutation("test.decide", decide);
const inQuery = <T>(decide: (ctx: QueryContext) => Promise<T>) => operations.query("test.decide", decide);
const memberDecisionInMutation = <V extends string | boolean>(flag: Flag<V>, member: MemberId) => inMutation((ctx) => memberDecision(ctx, flag, member));
const workspaceDecisionInMutation = <V extends string | boolean>(flag: Flag<V>) => inMutation((ctx) => workspaceDecision(ctx, flag, "T1"));
const seamCheckInQuery = (member: MemberId) => inQuery((ctx) => memberDecision(ctx, flagSeamCheck, member));

async function bothDecisionsAnswer<V extends string | boolean>(flag: Flag<V>, member: MemberId, expected: V): Promise<Array<[unknown, unknown]>> {
  return [
    [await memberDecisionInMutation(flag, member), expected],
    [await workspaceDecisionInMutation(flag), expected],
  ];
}

async function rolloutHash(key: string, id: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${key}.${id}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return parseInt(hex.slice(0, 15), 16) / 0xfffffffffffffff;
}

type Hashed = { id: string; hash: number };

async function sortedByRolloutHash(key: string, [first, second]: [string, string]): Promise<[Hashed, Hashed]> {
  const a = { id: first, hash: await rolloutHash(key, first) };
  const b = { id: second, hash: await rolloutHash(key, second) };
  return a.hash < b.hash ? [a, b] : [b, a];
}

const outboxEvents = async () => (await seed.all("analyticsOutbox")).map(({ event, distinctId, properties }) => ({ event, distinctId, properties }));

describe("O33: a flag answers its value for the subject, as today", () => {
  test("a flag rolled out to everyone answers on for a member, and a variant flag its variant for the workspace", async () => {
    const alice = await aMember();
    await load(onForEveryone("everyone-board"), variantForEveryone("board-layout", "compact"));

    expect(await memberDecisionInMutation(boardFlag, alice)).toBe(true);
    expect(await workspaceDecisionInMutation(layoutFlag)).toBe("compact");
  });

  test("O34: a flag on in the sandbox only is on in the sandbox and answers its safe default in production", async () => {
    const alice = await aMember();
    await load(onInTheSandboxOnly("everyone-board"));

    expect(await memberDecisionInMutation(boardFlag, alice)).toBe(true);
    vi.stubEnv("KUDOS_ENVIRONMENT", "production");
    expect(await memberDecisionInMutation(boardFlag, alice)).toBe(false);
  });

  test("a rollout percentage splits members by their analytics ID, the one their exposure is sent under", async () => {
    const [inside, outside] = await sortedByRolloutHash(boardFlag.key, ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
    const alice = await aMember();
    const bob = await aMember("U_BOB");
    await seed.insert("analyticsIds", { member: alice, analyticsId: inside.id });
    await seed.insert("analyticsIds", { member: bob, analyticsId: outside.id });
    await load(onForPercent(boardFlag.key, ((inside.hash + outside.hash) / 2) * 100));

    for (const member of [alice, bob]) await inMutation(async (ctx) => exposed(ctx, boardFlag, member, await memberDecision(ctx, boardFlag, member)));

    expect((await outboxEvents()).map(({ distinctId, properties }) => [distinctId, properties.feature_flag_response])).toEqual([
      [inside.id, true],
      [outside.id, false],
    ]);
  });
});

type CannotBeEvaluated = { condition: string; reads: (alice: MemberId) => Promise<Array<[answer: unknown, safeDefault: unknown]>> };

const cannotBeEvaluated: CannotBeEvaluated[] = [
  {
    condition: "without the flags key, even when PostHog turned the flag on",
    reads: async (alice) => {
      await load(onForEveryone("everyone-board"), variantForEveryone("board-layout", "compact"));
      vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");
      return [...(await bothDecisionsAnswer(boardFlag, alice, false)), ...(await bothDecisionsAnswer(layoutFlag, alice, "control"))];
    },
  },
  { condition: "before any definitions are stored", reads: (alice) => bothDecisionsAnswer(boardFlag, alice, false) },
  {
    condition: "for a flag PostHog doesn't have",
    reads: async (alice) => {
      await load(onForEveryone("another-flag"));
      return bothDecisionsAnswer(boardFlag, alice, false);
    },
  },
  {
    condition: "for a value the flag doesn't declare",
    reads: async (alice) => {
      await load(variantForEveryone("board-layout", "purple"), variantForEveryone("everyone-board", "on"));
      return [...(await bothDecisionsAnswer(layoutFlag, alice, "control")), ...(await bothDecisionsAnswer(boardFlag, alice, false))];
    },
  },
  {
    condition: "O34: for a cohort condition local evaluation can't answer",
    reads: async (alice) => {
      await load(inACohort("everyone-board"));
      return bothDecisionsAnswer(boardFlag, alice, false);
    },
  },
  {
    condition: "O34: when the environment isn't set, for a flag that targets it",
    reads: async (alice) => {
      await load(onInTheSandboxOnly("everyone-board"));
      vi.stubEnv("KUDOS_ENVIRONMENT", "");
      return bothDecisionsAnswer(boardFlag, alice, false);
    },
  },
  {
    condition: "in a query, for a member who has no analytics ID yet in a workspace without a key, and the query creates neither",
    reads: async (alice) => {
      await load(onForEveryone(flagSeamCheck.key));
      return [
        [await seamCheckInQuery(alice), false],
        [await seed.all("analyticsIds"), []],
        [await seed.all("workspaceKeys"), []],
      ];
    },
  },
];

describe("O31 O33 O34: a flag answers its safe default whenever it can't be evaluated, as today", () => {
  test.each(cannotBeEvaluated.map((each) => [each.condition, each] as const))("%s", async (condition, { reads }) => {
    const alice = await aMember();
    for (const [answer, safeDefault] of await reads(alice)) expect(answer, condition).toEqual(safeDefault);
  });

  test("in a query, a flag answers for a member once a mutation gave them an analytics ID", async () => {
    const alice = await aMember();
    await load(onForEveryone(flagSeamCheck.key));

    await memberDecisionInMutation(flagSeamCheck, alice);

    expect(await seamCheckInQuery(alice)).toBe(true);
  });
});

describe("F12 F13 F14 F15: a flag answers for the member and for the workspace, as today", () => {
  const seamCheckFor = (...emails: string[]) => onForEmails(flagSeamCheck.key, ...emails);

  test("F13: an email condition is on for the member it names alone, and never for the workspace", async () => {
    const alice = await aMember("U_ALICE", "alice@example.com");
    const bob = await aMember("U_BOB", "bob@example.com");
    const carol = await aMember("U_CAROL");
    await load(seamCheckFor("alice@example.com"));

    expect({
      alice: await memberDecisionInMutation(flagSeamCheck, alice),
      bob: await memberDecisionInMutation(flagSeamCheck, bob),
      carol: await memberDecisionInMutation(flagSeamCheck, carol),
      workspace: await workspaceDecisionInMutation(flagSeamCheck),
    }).toEqual({ alice: true, bob: false, carol: false, workspace: false });
  });

  test("F13: a member without an email still matches the flag's other conditions", async () => {
    const carol = await aMember("U_CAROL");
    const emailOrSandbox = seamCheckFor("alice@example.com");
    emailOrSandbox.filters.groups.push(onInTheSandboxOnly(flagSeamCheck.key).filters.groups[0]!);
    await load(emailOrSandbox);

    expect(await memberDecisionInMutation(flagSeamCheck, carol)).toBe(true);
  });

  test("F15: an environment condition at 100% gives every member the workspace decision", async () => {
    const members = [await aMember("U_ALICE", "alice@example.com"), await aMember("U_BOB", "bob@example.com"), await aMember("U_CAROL")];
    await load(onInTheSandboxOnly(flagSeamCheck.key));
    for (const environment of ["sandbox", "production"]) {
      vi.stubEnv("KUDOS_ENVIRONMENT", environment);

      const workspace = await workspaceDecisionInMutation(flagSeamCheck);
      for (const member of members) expect(await memberDecisionInMutation(flagSeamCheck, member), environment).toBe(workspace);
      expect(workspace, environment).toBe(environment === "sandbox");
    }
  });

  test("F14: in a query, a member without an analytics ID gets the workspace decision, and the query creates no ID", async () => {
    const alice = await aMember("U_ALICE", "alice@example.com");
    await inMutation((ctx) => workspaceKeyOf(ctx, "T1"));

    await load(onForEveryone(flagSeamCheck.key));
    expect(await seamCheckInQuery(alice)).toBe(true);
    await load(seamCheckFor("alice@example.com"));
    expect(await seamCheckInQuery(alice)).toBe(false);
    expect(await seed.all("analyticsIds")).toEqual([]);
  });

  test("F14: in a mutation, the member decision creates the member's analytics ID and answers for it", async () => {
    const alice = await aMember("U_ALICE", "alice@example.com");
    await load(seamCheckFor("alice@example.com"));

    expect(await memberDecisionInMutation(flagSeamCheck, alice)).toBe(true);
    expect(await seed.all("analyticsIds")).toEqual([expect.objectContaining({ member: alice })]);
    expect(await seamCheckInQuery(alice)).toBe(true);
  });

  test("the forms without writing never create an ID or a key, even in a mutation", async () => {
    const alice = await aMember("U_ALICE", "alice@example.com");
    await load(onForEveryone(flagSeamCheck.key));

    const answers = await inMutation(async (ctx) => [await memberDecisionWithoutWriting(ctx, flagSeamCheck, alice), await workspaceDecisionWithoutWriting(ctx, flagSeamCheck, "T1")]);

    expect(answers, "no key yet: the safe default").toEqual([false, false]);
    expect({ ids: await seed.all("analyticsIds"), keys: await seed.all("workspaceKeys") }).toEqual({ ids: [], keys: [] });
  });
});

describe("O36: exposure, as today", () => {
  test("records $feature_flag_called once per member, flag and value, under the member's analytics ID", async () => {
    const alice = await aMember();
    const bob = await aMember("U_BOB");

    await inMutation((ctx) => exposed(ctx, boardFlag, alice, true));
    await inMutation((ctx) => exposed(ctx, boardFlag, alice, true));
    await inMutation((ctx) => exposed(ctx, boardFlag, alice, false));
    await inMutation((ctx) => exposed(ctx, boardFlag, bob, true));

    const idOf = (member: MemberId) => inQuery((ctx) => existingAnalyticsId(ctx, member));
    const shared = { environment: "sandbox", workspace_key: expect.any(String), taxonomy_version: 1 };
    const called = (response: boolean) => ({ ...shared, feature_flag: "everyone-board", feature_flag_response: response, locally_evaluated: true });
    expect(await outboxEvents()).toEqual([
      { event: "$feature_flag_called", distinctId: await idOf(alice), properties: called(true) },
      { event: "$feature_flag_called", distinctId: await idOf(alice), properties: called(false) },
      { event: "$feature_flag_called", distinctId: await idOf(bob), properties: called(true) },
    ]);
    expect((await seed.all("flagExposures")).map(({ member, flag, value }) => [member, flag, value])).toEqual([
      [alice, "everyone-board", true],
      [alice, "everyone-board", false],
      [bob, "everyone-board", true],
    ]);
  });

  test("without the flags key nothing is evaluated, so nothing is recorded", async () => {
    const alice = await aMember();
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");

    await inMutation(async (ctx) => exposed(ctx, boardFlag, alice, await memberDecision(ctx, boardFlag, alice)));

    expect({ outbox: await seed.all("analyticsOutbox"), exposures: await seed.all("flagExposures") }).toEqual({ outbox: [], exposures: [] });
  });

  test("with capture off nothing is recorded, and the first exposure after capture comes on still is", async () => {
    const alice = await aMember();
    vi.stubEnv("KUDOS_ENVIRONMENT", "");
    await inMutation((ctx) => exposed(ctx, boardFlag, alice, true));
    expect(await seed.all("analyticsOutbox")).toEqual([]);

    vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
    await inMutation((ctx) => exposed(ctx, boardFlag, alice, true));
    expect((await outboxEvents()).map(({ event }) => event)).toEqual(["$feature_flag_called"]);
  });
});

describe("a member's analytics ID is the oldest one stored, as today", () => {
  test("every decision, its keep and the exposure use the oldest ID, and no third one is made", async () => {
    const [inside, outside] = await sortedByRolloutHash(flagSeamCheck.key, ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
    const alice = await aMember();
    await seed.insert("analyticsIds", { member: alice, analyticsId: inside.id });
    await seed.insert("analyticsIds", { member: alice, analyticsId: outside.id });
    await load(onForPercent(flagSeamCheck.key, ((inside.hash + outside.hash) / 2) * 100));

    const read = await inMutation(async (ctx) => {
      const decision = await memberDecisionBeforeWriting(ctx, flagSeamCheck, alice);
      await decision.keep();
      const decided = await memberDecision(ctx, flagSeamCheck, alice);
      await exposed(ctx, flagSeamCheck, alice, decided);
      return { beforeWriting: decision.value, decided, existing: await existingAnalyticsId(ctx, alice), recorded: await analyticsIdOf(ctx, alice) };
    });

    expect(read).toEqual({ beforeWriting: true, decided: true, existing: inside.id, recorded: inside.id });
    expect(await seamCheckInQuery(alice), "a query decides on the oldest ID").toBe(true);
    expect((await outboxEvents()).map(({ distinctId }) => distinctId)).toEqual([inside.id]);
    expect((await seed.all("analyticsIds")).length, "no third ID is recorded").toBe(2);
  });

  test("a decision before writing keeps a new member's ID only when asked to", async () => {
    const alice = await aMember();
    await load(onForEveryone(flagSeamCheck.key));

    const dropped = await inMutation(async (ctx) => (await memberDecisionBeforeWriting(ctx, flagSeamCheck, alice)).value);
    expect({ dropped, ids: await seed.all("analyticsIds") }).toEqual({ dropped: true, ids: [] });
    await inMutation(async (ctx) => (await memberDecisionBeforeWriting(ctx, flagSeamCheck, alice)).keep());
    expect((await seed.all("analyticsIds")).length).toBe(1);
  });
});

describe("the operation's definitions snapshot", () => {
  test("cold start: with no definitions stored every decision is its safe default; after one refresh, the defined value", async () => {
    const alice = await aMember("U_ALICE", "alice@example.com");
    await inMutation((ctx) => workspaceKeyOf(ctx, "T1"));
    postHog.withFlags(onForEveryone("everyone-board"), variantForEveryone("board-layout", "compact"));
    const everyDecision = async () => ({
      inMutation: await inMutation(async (ctx) => [await memberDecision(ctx, boardFlag, alice), await workspaceDecision(ctx, layoutFlag, "T1")]),
      inQuery: await inQuery(async (ctx) => [await memberDecision(ctx, boardFlag, alice), await workspaceDecision(ctx, layoutFlag, "T1")]),
    });

    expect(await everyDecision()).toEqual({ inMutation: [false, "control"], inQuery: [false, "control"] });
    expect(postHog.definitionRequests, "no decision fetched them").toBe(0);
    await load(onForEveryone("everyone-board"), variantForEveryone("board-layout", "compact"));
    expect(await everyDecision()).toEqual({ inMutation: [true, "compact"], inQuery: [true, "compact"] });
  });

  test("an operation reads the stored definitions once, however many flags it decides", async () => {
    const alice = await aMember();
    await load(onForEveryone("everyone-board"), variantForEveryone("board-layout", "compact"));
    definitionReads = 0;

    const answers = await inMutation(async (ctx) => [await memberDecision(ctx, boardFlag, alice), await workspaceDecision(ctx, layoutFlag, "T1"), await memberDecision(ctx, layoutFlag, alice)]);
    const inAQuery = await inQuery(async (ctx) => [await memberDecision(ctx, boardFlag, alice), await workspaceDecision(ctx, layoutFlag, "T1")]);

    expect({ answers, inAQuery, definitionReads }).toEqual({ answers: [true, "compact", "compact"], inAQuery: [true, "compact"], definitionReads: 2 });
  });

  test("a refresh that commits mid-operation changes none of its decisions; the next operation sees the new value", async () => {
    const alice = await aMember();
    await inMutation((ctx) => workspaceKeyOf(ctx, "T1"));
    await load(onForEveryone("everyone-board"));

    for (const [kind, run] of [["mutation", inMutation], ["query", inQuery]] as const) {
      await load(onForEveryone("everyone-board"));
      let refreshed!: () => void;
      const refreshCommitted = new Promise<void>((resolve) => (refreshed = resolve));
      const decided = (run as typeof inQuery)(async (ctx) => {
        const before = [await memberDecision(ctx, boardFlag, alice), await workspaceDecision(ctx, boardFlag, "T1")];
        await refreshCommitted;
        return { before, after: [await memberDecision(ctx, boardFlag, alice), await workspaceDecision(ctx, boardFlag, "T1")] };
      });
      await vi.waitFor(() => expect(definitionReads, "the operation read its snapshot").toBeGreaterThan(0));
      await load(onForEveryone("another-flag"));
      refreshed();

      expect(await decided, kind).toEqual({ before: [true, true], after: [true, true] });
      expect(await run((ctx) => workspaceDecision(ctx, boardFlag, "T1")), `${kind}: the next operation`).toBe(false);
      definitionReads = 0;
    }
  });

  test("a mutation re-run on 40001 reads the definitions again on its new attempt, never mixes the two, and never fetches", async () => {
    const alice = await aMember();
    await inMutation((ctx) => workspaceKeyOf(ctx, "T1"));
    await load(onForEveryone("everyone-board"));
    const requestsBefore = postHog.definitionRequests;
    const attempts: unknown[][] = [];
    let firstRead!: () => void;
    const firstAttemptRead = new Promise<void>((resolve) => (firstRead = resolve));
    let refreshed!: () => void;
    const refreshCommitted = new Promise<void>((resolve) => (refreshed = resolve));

    const deciding = inMutation(async (ctx) => {
      const decisions = [await memberDecision(ctx, boardFlag, alice)];
      attempts.push(decisions);
      if (attempts.length === 1) {
        firstRead();
        await refreshCommitted;
        decisions.push(await workspaceDecision(ctx, boardFlag, "T1"));
        await ctx.tx.execute(sql`do $$ begin raise exception using errcode = '40001'; end $$`);
      }
      decisions.push(await workspaceDecision(ctx, boardFlag, "T1"));
      return decisions;
    });
    await firstAttemptRead;
    await load(onForEveryone("another-flag"));
    refreshed();
    const answer = await deciding;

    expect(attempts, "the losing attempt kept its snapshot; the winning one read the new row").toEqual([
      [true, true],
      [false, false],
    ]);
    expect(answer).toEqual([false, false]);
    expect(postHog.definitionRequests - requestsBefore, "only the refresh between fetched").toBe(1);
  });
});

describe("no network inside an operation", () => {
  test("decisions and exposures in a query and a mutation fetch nothing, even when PostHog fails every call, stored definitions or not", async () => {
    const alice = await aMember("U_ALICE", "alice@example.com");
    let fetches = 0;
    const failing = postHogDeciding("sandbox").answering(...Array.from({ length: 50 }, () => failsToConnect)).answeringDefinitions(...Array.from({ length: 50 }, () => failsToConnect));
    vi.stubGlobal("fetch", (...args: Parameters<typeof fetch>) => {
      fetches += 1;
      return routedFetch(failing, () => Promise.reject(new Error("no network in tests")))(...args);
    });

    const everything = async () => {
      await inQuery(async (ctx) => [
        await memberDecision(ctx, boardFlag, alice),
        await memberDecisionWithoutWriting(ctx, boardFlag, alice),
        await workspaceDecision(ctx, layoutFlag, "T1"),
        await workspaceDecisionWithoutWriting(ctx, layoutFlag, "T1"),
      ]);
      await inMutation(async (ctx) => {
        const before = await memberDecisionBeforeWriting(ctx, boardFlag, alice);
        await before.keep();
        await exposed(ctx, boardFlag, alice, await memberDecision(ctx, boardFlag, alice));
        return [await workspaceDecision(ctx, layoutFlag, "T1"), await memberDecisionWithoutWriting(ctx, layoutFlag, alice)];
      });
    };
    await everything();
    await definitionsStored(operations, onForEveryone("everyone-board"), variantForEveryone("board-layout", "compact"));
    await everything();

    expect({ fetches, definitionRequests: failing.definitionRequests, batches: failing.requests.length }).toEqual({ fetches: 0, definitionRequests: 0, batches: 0 });
    expect(await inQuery((ctx) => memberDecision(ctx, boardFlag, alice)), "the stored definitions decided").toBe(true);
  });

  test("the flag module reaches no fetch: no module it imports, however deep, calls one or imports the refresh", () => {
    const root = fileURLToPath(new URL(".", import.meta.url));
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      for (const [, specifier] of source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) visit(join(dirname(file), specifier!));
    };
    visit(join(root, "flags.ts"));
    const reached = [...seen].map((file) => relative(root, file));

    expect(reached, "the walk found the snapshot's modules").toEqual(expect.arrayContaining(["flags.ts", "definitions.ts", "evaluator/evaluator.ts", "outbox.ts"]));
    expect(reached.filter((file) => file.endsWith("refresh.ts")), "the refresh").toEqual([]);
    expect(reached.filter((file) => /\bfetch\s*\(/.test(readFileSync(join(root, file), "utf8"))), "a fetch call").toEqual([]);
  });

  test("the flags key never reaches an operation's decision: it only gates it", () => {
    expect(readFileSync(new URL("./flags.ts", import.meta.url), "utf8")).not.toContain(flagsKey);
  });
});
