import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type FakePostHog, flagsKey, routedFetch, type FlagDefinition } from "../../testing/fakePostHog";
import { flagsFromPostHog, onForEmails, onForEveryone, onInTheSandboxOnly, postHogDeciding } from "../../testing/flags";
import { settle, testBackend, type Backend } from "../../testing/slackBackend";
import { internal } from "../_generated/api";
import type { MemberId } from "../workspace/directory";
import { workspaceKeyOf } from "./outbox";
import { exposed, flagSeamCheck, memberDecision, memberDecisionBeforeWriting, workspaceDecision, type Flag } from "./flags";
import { analyticsIdOf as storedAnalyticsIdOf, existingAnalyticsId } from "./person";

const now = new Date("2026-10-13T10:00:00Z");

const boardFlag = { key: "everyone-board", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
const layoutFlag = {
  key: "board-layout",
  safeDefault: "control",
  values: ["control", "compact"],
} as const satisfies Flag<"control" | "compact">;

const variantForEveryone = (key: string, variant: string): FlagDefinition => ({
  key,
  filters: { groups: [{ properties: [], rollout_percentage: 100 }], multivariate: { variants: [{ key: variant, rollout_percentage: 100 }] } },
});
const inACohort = (key: string): FlagDefinition => ({
  key,
  filters: { groups: [{ properties: [{ key: "id", type: "cohort", value: 7 }], rollout_percentage: 100 }] },
});

let postHog: FakePostHog;

beforeEach(() => {
  vi.useFakeTimers({ now });
  postHog = postHogDeciding();
  vi.stubGlobal("fetch", routedFetch(postHog, () => Promise.reject(new Error("no network in tests"))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function aMember(t: Backend, user = "U_ALICE", email?: string) {
  return t.run((ctx) => ctx.db.insert("members", { workspace: "T1", user, kind: "member", email }));
}

type Hashed = { id: string; hash: number };

async function sortedByRolloutHash(key: string, [first, second]: [string, string]): Promise<[Hashed, Hashed]> {
  const a = { id: first, hash: await rolloutHash(key, first) };
  const b = { id: second, hash: await rolloutHash(key, second) };
  return a.hash < b.hash ? [a, b] : [b, a];
}

async function rolloutHash(key: string, id: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${key}.${id}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return parseInt(hex.slice(0, 15), 16) / 0xfffffffffffffff;
}

function definitionsFromPostHog(t: Backend, ...definitions: FlagDefinition[]) {
  return flagsFromPostHog(t, postHog, ...definitions);
}

function memberDecisionInMutation<V extends string | boolean>(t: Backend, read: Flag<V>, member: MemberId) {
  return t.run((ctx) => memberDecision(ctx, read, member));
}

function workspaceDecisionInMutation<V extends string | boolean>(t: Backend, read: Flag<V>, workspace = "T1") {
  return t.run((ctx) => workspaceDecision(ctx, read, workspace));
}

async function bothDecisionsInMutation<V extends string | boolean>(t: Backend, read: Flag<V>, member: MemberId) {
  return [await memberDecisionInMutation(t, read, member), await workspaceDecisionInMutation(t, read)];
}

async function bothDecisionsAnswer<V extends string | boolean>(t: Backend, read: Flag<V>, member: MemberId, expected: V): Promise<Array<[unknown, unknown]>> {
  return (await bothDecisionsInMutation(t, read, member)).map((answer) => [answer, expected]);
}

describe("O33: a flag answers its value for the subject", () => {
  test("a flag rolled out to everyone answers on for a member", async () => {
    const t = testBackend();
    const alice = await aMember(t);
    await definitionsFromPostHog(t, onForEveryone("everyone-board"));

    expect(await memberDecisionInMutation(t, boardFlag, alice)).toBe(true);
  });

  test("a variant flag answers its variant for the workspace", async () => {
    const t = testBackend();
    await definitionsFromPostHog(t, variantForEveryone("board-layout", "compact"));

    expect(await workspaceDecisionInMutation(t, layoutFlag)).toBe("compact");
  });

  test("one function reads the cached definitions once, however many flags it decides", async () => {
    const t = testBackend();
    const alice = await aMember(t);
    await definitionsFromPostHog(t, onForEveryone("everyone-board"), variantForEveryone("board-layout", "compact"));

    const decided = await t.run(async (ctx) => {
      const reads = vi.spyOn(ctx, "runQuery");
      const answers = [await memberDecision(ctx, boardFlag, alice), await workspaceDecision(ctx, layoutFlag, "T1"), await memberDecision(ctx, layoutFlag, alice)];
      return { answers, definitionReads: reads.mock.calls.length };
    });

    expect(decided).toEqual({ answers: [true, "compact", "compact"], definitionReads: 1 });
  });

  test("O34: a flag on in the sandbox only is on in the sandbox and answers its safe default in production", async () => {
    const t = testBackend();
    const alice = await aMember(t);
    await definitionsFromPostHog(t, onInTheSandboxOnly("everyone-board"));

    expect(await memberDecisionInMutation(t, boardFlag, alice)).toBe(true);
    vi.stubEnv("KUDOS_ENVIRONMENT", "production");
    expect(await memberDecisionInMutation(t, boardFlag, alice)).toBe(false);
  });
});

type CannotBeEvaluated = { condition: string; reads: (t: Backend, alice: MemberId) => Promise<Array<[answer: unknown, safeDefault: unknown]>> };

const cannotBeEvaluated: CannotBeEvaluated[] = [
  {
    condition: "without the flags key, even when PostHog turned the flag on",
    reads: async (t, alice) => {
      await definitionsFromPostHog(t, onForEveryone("everyone-board"), variantForEveryone("board-layout", "compact"));
      vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");
      return [...(await bothDecisionsAnswer(t, boardFlag, alice, false)), ...(await bothDecisionsAnswer(t, layoutFlag, alice, "control"))];
    },
  },
  {
    condition: "before any definitions are cached",
    reads: (t, alice) => bothDecisionsAnswer(t, boardFlag, alice, false),
  },
  {
    condition: "for a flag PostHog doesn't have",
    reads: async (t, alice) => {
      await definitionsFromPostHog(t, onForEveryone("another-flag"));
      return bothDecisionsAnswer(t, boardFlag, alice, false);
    },
  },
  {
    condition: "for a value the flag doesn't declare",
    reads: async (t, alice) => {
      await definitionsFromPostHog(t, variantForEveryone("board-layout", "purple"), variantForEveryone("everyone-board", "on"));
      return [...(await bothDecisionsAnswer(t, layoutFlag, alice, "control")), ...(await bothDecisionsAnswer(t, boardFlag, alice, false))];
    },
  },
  {
    condition: "O34: for a cohort condition local evaluation can't answer",
    reads: async (t, alice) => {
      await definitionsFromPostHog(t, inACohort("everyone-board"));
      return bothDecisionsAnswer(t, boardFlag, alice, false);
    },
  },
  {
    condition: "O34: when the environment isn't set, for a flag that targets it",
    reads: async (t, alice) => {
      await definitionsFromPostHog(t, onInTheSandboxOnly("everyone-board"));
      vi.stubEnv("KUDOS_ENVIRONMENT", "");
      return bothDecisionsAnswer(t, boardFlag, alice, false);
    },
  },
  {
    condition: "in a query, for a member who has no analytics ID yet in a workspace without a key, and the query creates neither",
    reads: async (t, alice) => {
      await definitionsFromPostHog(t, onForEveryone(flagSeamCheck.key));
      return [
        [await t.query(internal.analytics.flags.seamCheck, { member: alice }), false],
        [await t.run((ctx) => ctx.db.query("analyticsIds").collect()), []],
        [await t.run((ctx) => ctx.db.query("workspaceKeys").collect()), []],
      ];
    },
  },
];

describe("O31 O33 O34", () => {
  test("a flag answers its safe default whenever it can't be evaluated", async () => {
    for (const { condition, reads } of cannotBeEvaluated) {
      vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
      vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
      const t = testBackend();
      const alice = await aMember(t);
      for (const [answer, safeDefault] of await reads(t, alice)) expect(answer, condition).toEqual(safeDefault);
    }
  });

  test("in a query, a flag answers for a member once a mutation gave them an analytics ID", async () => {
    const t = testBackend();
    const alice = await aMember(t);
    await definitionsFromPostHog(t, onForEveryone(flagSeamCheck.key));

    await memberDecisionInMutation(t, flagSeamCheck, alice);

    expect(await t.query(internal.analytics.flags.seamCheck, { member: alice })).toBe(true);
  });
});

describe("F12 F13 F14: a flag answers for the member and for the workspace", () => {
  const seamCheckFor = (...emails: string[]) => onForEmails(flagSeamCheck.key, ...emails);

  test("F13: an email condition is on for the member it names alone, and never for the workspace", async () => {
    const t = testBackend();
    const alice = await aMember(t, "U_ALICE", "alice@example.com");
    const bob = await aMember(t, "U_BOB", "bob@example.com");
    const carol = await aMember(t, "U_CAROL");
    await definitionsFromPostHog(t, seamCheckFor("alice@example.com"));

    expect({
      alice: await memberDecisionInMutation(t, flagSeamCheck, alice),
      bob: await memberDecisionInMutation(t, flagSeamCheck, bob),
      carol: await memberDecisionInMutation(t, flagSeamCheck, carol),
      workspace: await workspaceDecisionInMutation(t, flagSeamCheck),
    }).toEqual({ alice: true, bob: false, carol: false, workspace: false });
  });

  test("F13: a member without an email still matches the flag's other conditions", async () => {
    const t = testBackend();
    const carol = await aMember(t, "U_CAROL");
    const emailOrSandbox = seamCheckFor("alice@example.com");
    emailOrSandbox.filters.groups.push(onInTheSandboxOnly(flagSeamCheck.key).filters.groups[0]!);
    await definitionsFromPostHog(t, emailOrSandbox);

    expect(await memberDecisionInMutation(t, flagSeamCheck, carol)).toBe(true);
  });

  test("F15: an environment condition at 100% gives every member the workspace decision", async () => {
    for (const environment of ["sandbox", "production"]) {
      vi.stubEnv("KUDOS_ENVIRONMENT", environment);
      const t = testBackend();
      const members = [await aMember(t, "U_ALICE", "alice@example.com"), await aMember(t, "U_BOB", "bob@example.com"), await aMember(t, "U_CAROL")];
      await definitionsFromPostHog(t, onInTheSandboxOnly(flagSeamCheck.key));

      const workspace = await workspaceDecisionInMutation(t, flagSeamCheck);
      for (const member of members) expect(await memberDecisionInMutation(t, flagSeamCheck, member), environment).toBe(workspace);
      expect(workspace, environment).toBe(environment === "sandbox");
    }
  });

  test("F14: in a query, a member without an analytics ID gets the workspace decision, and the query creates no ID", async () => {
    const t = testBackend();
    const alice = await aMember(t, "U_ALICE", "alice@example.com");
    await t.run((ctx) => workspaceKeyOf(ctx, "T1"));

    await definitionsFromPostHog(t, onForEveryone(flagSeamCheck.key));
    expect(await t.query(internal.analytics.flags.seamCheck, { member: alice })).toBe(true);
    await definitionsFromPostHog(t, seamCheckFor("alice@example.com"));
    expect(await t.query(internal.analytics.flags.seamCheck, { member: alice })).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("analyticsIds").collect())).toEqual([]);
  });

  test("F14: in a mutation, the member decision creates the member's analytics ID and answers for it", async () => {
    const t = testBackend();
    const alice = await aMember(t, "U_ALICE", "alice@example.com");
    await definitionsFromPostHog(t, seamCheckFor("alice@example.com"));

    expect(await memberDecisionInMutation(t, flagSeamCheck, alice)).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("analyticsIds").collect())).toEqual([expect.objectContaining({ member: alice })]);
    expect(await t.query(internal.analytics.flags.seamCheck, { member: alice })).toBe(true);
  });
});

describe("O36: exposure", () => {
  test("sends $feature_flag_called once per member, flag and value, under the member's analytics ID", async () => {
    const t = testBackend();
    const alice = await aMember(t);
    const bob = await aMember(t, "U_BOB");

    await t.run((ctx) => exposed(ctx, boardFlag, alice, true));
    await t.run((ctx) => exposed(ctx, boardFlag, alice, true));
    await t.run((ctx) => exposed(ctx, boardFlag, alice, false));
    await t.run((ctx) => exposed(ctx, boardFlag, bob, true));
    await settle(t);

    const exposures = postHog.productEvents().map(({ event, distinct_id, properties }) => ({ event, distinct_id, properties }));
    const analyticsIdOf = (member: MemberId) =>
      t.run(async (ctx) => (await ctx.db.query("analyticsIds").withIndex("by_member", (q) => q.eq("member", member)).unique())?.analyticsId);
    const shared = { environment: "sandbox", workspace_key: expect.any(String), taxonomy_version: 1 };
    expect(exposures).toEqual([
      { event: "$feature_flag_called", distinct_id: await analyticsIdOf(alice), properties: { ...shared, $feature_flag: "everyone-board", $feature_flag_response: true, locally_evaluated: true } },
      { event: "$feature_flag_called", distinct_id: await analyticsIdOf(alice), properties: { ...shared, $feature_flag: "everyone-board", $feature_flag_response: false, locally_evaluated: true } },
      { event: "$feature_flag_called", distinct_id: await analyticsIdOf(bob), properties: { ...shared, $feature_flag: "everyone-board", $feature_flag_response: true, locally_evaluated: true } },
    ]);
  });

  test("a member's flag is evaluated on their analytics ID, the one its exposure is sent under", async () => {
    const t = testBackend();
    const [inside, outside] = await sortedByRolloutHash(boardFlag.key, ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
    const alice = await aMember(t);
    const bob = await aMember(t, "U_BOB");
    await t.run(async (ctx) => {
      await ctx.db.insert("analyticsIds", { member: alice, analyticsId: inside.id });
      await ctx.db.insert("analyticsIds", { member: bob, analyticsId: outside.id });
    });
    const between = ((inside.hash + outside.hash) / 2) * 100;
    await definitionsFromPostHog(t, { key: boardFlag.key, filters: { groups: [{ properties: [], rollout_percentage: between }] } });

    for (const member of [alice, bob]) {
      await t.run(async (ctx) => exposed(ctx, boardFlag, member, await memberDecision(ctx, boardFlag, member)));
    }
    await settle(t);

    expect(postHog.productEvents().map((event) => [event.distinct_id, event.properties.$feature_flag_response])).toEqual([
      [inside.id, true],
      [outside.id, false],
    ]);
  });

  test("without the flags key nothing is evaluated, so nothing is sent", async () => {
    const t = testBackend();
    const alice = await aMember(t);
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");

    await t.run(async (ctx) => exposed(ctx, boardFlag, alice, await memberDecision(ctx, boardFlag, alice)));
    await settle(t);

    expect(postHog.productEvents()).toEqual([]);
  });

  test("with capture off nothing is sent, and the first exposure after capture comes on still is", async () => {
    const t = testBackend();
    const alice = await aMember(t);
    vi.stubEnv("KUDOS_ENVIRONMENT", "");

    await t.run((ctx) => exposed(ctx, boardFlag, alice, true));
    await settle(t);
    expect(postHog.productEvents()).toEqual([]);

    vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
    await t.run((ctx) => exposed(ctx, boardFlag, alice, true));
    await settle(t);
    expect(postHog.productEvents().map((event) => event.event)).toEqual(["$feature_flag_called"]);
  });
});

describe("a member's analytics ID is the oldest one stored", () => {
  test("a member's analytics ID is the oldest one stored", async () => {
    const t = testBackend();
    const [inside, outside] = await sortedByRolloutHash(boardFlag.key, ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
    const alice = await aMember(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("analyticsIds", { member: alice, analyticsId: inside.id });
      await ctx.db.insert("analyticsIds", { member: alice, analyticsId: outside.id });
    });
    const between = ((inside.hash + outside.hash) / 2) * 100;
    await definitionsFromPostHog(t, { key: boardFlag.key, filters: { groups: [{ properties: [], rollout_percentage: between }] } });

    const read = await t.run(async (ctx) => {
      const decision = await memberDecisionBeforeWriting(ctx, boardFlag, alice);
      await decision.keep();
      const decided = await memberDecision(ctx, boardFlag, alice);
      await exposed(ctx, boardFlag, alice, decided);
      return { beforeWriting: decision.value, decided, existing: await existingAnalyticsId(ctx, alice), recorded: await storedAnalyticsIdOf(ctx, alice) };
    });
    await settle(t);

    expect(read).toEqual({ beforeWriting: true, decided: true, existing: inside.id, recorded: inside.id });
    expect(await t.query(internal.analytics.flags.seamCheck, { member: alice }), "a query reads the member without throwing").toBe(false);
    expect(postHog.productEvents().map((event) => event.distinct_id)).toEqual([inside.id]);
    expect(await t.run(async (ctx) => (await ctx.db.query("analyticsIds").collect()).length), "no third ID is recorded").toBe(2);
  });
});
