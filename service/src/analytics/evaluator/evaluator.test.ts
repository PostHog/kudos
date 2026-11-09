// Ported from @posthog/convex 2.1.5, src/client/feature-flags/evaluator.test.ts (MIT, PostHog Inc.): the cases for the
// flag kinds kudos uses (boolean and multivariate flags, rollout percentages, person property conditions on email and
// environment, and the conditions local evaluation can't answer, which kudos reads as the safe default). Payloads,
// groups, `getAllFlagsAndPayloads` and device-ID bucketing are left out: kudos uses none of them.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseDefinitions } from "../definitions.ts";
import { LocalFeatureFlagEvaluator } from "./evaluator.ts";
import type { FlagDefinitions, PostHogFeatureFlag } from "./types.ts";

// Every fixture is also an answer PostHog could send, so each one passes the refresh's definitions check.
function definitions(flags: PostHogFeatureFlag[], extra: Partial<FlagDefinitions> = {}): FlagDefinitions {
  const fixture = { flags, groupTypeMapping: extra.groupTypeMapping ?? {}, cohorts: extra.cohorts ?? {} };
  expect(parseDefinitions({ flags, group_type_mapping: fixture.groupTypeMapping, cohorts: fixture.cohorts }), "the definitions check passes the fixture").toEqual(fixture);
  return fixture;
}

function makeFlag(key: string, overrides: Partial<PostHogFeatureFlag> = {}): PostHogFeatureFlag {
  return {
    id: 1,
    name: key,
    key,
    deleted: false,
    active: true,
    rollout_percentage: null,
    ensure_experience_continuity: false,
    experiment_set: [],
    filters: { groups: [{ properties: [], rollout_percentage: 100 }] },
    ...overrides,
  };
}

const personCondition = (key: string, value: string | string[], operator = "exact", negation = false) => ({
  properties: [{ key, value, operator, type: "person", negation }],
  rollout_percentage: 100,
});

describe("the local evaluator", () => {
  test("answers undefined for a flag it doesn't have", async () => {
    expect(await new LocalFeatureFlagEvaluator(definitions([])).getFeatureFlag("missing", "user")).toBeUndefined();
  });

  test("answers false for an inactive flag, even with experience continuity", async () => {
    const evaluator = new LocalFeatureFlagEvaluator(definitions([makeFlag("off", { active: false }), makeFlag("off-continuity", { active: false, ensure_experience_continuity: true })]));

    expect(await evaluator.getFeatureFlag("off", "user")).toBe(false);
    expect(await evaluator.getFeatureFlag("off-continuity", "user")).toBe(false);
  });

  test("answers true for a boolean flag rolled out to everyone, and false at 0%", async () => {
    const evaluator = new LocalFeatureFlagEvaluator(definitions([makeFlag("on"), makeFlag("rollout-0", { filters: { groups: [{ properties: [], rollout_percentage: 0 }] } })]));

    expect(await evaluator.getFeatureFlag("on", "user")).toBe(true);
    expect(await evaluator.getFeatureFlag("rollout-0", "user-123")).toBe(false);
  });

  test("matches an exact person property, one value or a list of them", async () => {
    const evaluator = new LocalFeatureFlagEvaluator(
      definitions([
        makeFlag("sandbox-only", { filters: { groups: [personCondition("environment", ["sandbox"])] } }),
        makeFlag("for-emails", { filters: { groups: [personCondition("email", ["alice@example.com", "bob@example.com"])] } }),
      ]),
    );

    expect(await evaluator.getFeatureFlag("sandbox-only", "user", {}, { environment: "sandbox" })).toBe(true);
    expect(await evaluator.getFeatureFlag("sandbox-only", "user", {}, { environment: "production" })).toBe(false);
    expect(await evaluator.getFeatureFlag("for-emails", "user", {}, { email: "bob@example.com" })).toBe(true);
    expect(await evaluator.getFeatureFlag("for-emails", "user", {}, { email: "carol@example.com" })).toBe(false);
  });

  test("is inconclusive for a condition on a person property it wasn't given", async () => {
    const evaluator = new LocalFeatureFlagEvaluator(definitions([makeFlag("sandbox-only", { filters: { groups: [personCondition("environment", ["sandbox"])] } })]));

    expect(await evaluator.getFeatureFlag("sandbox-only", "user", {}, {})).toBeUndefined();
  });

  test("inverts a condition property when negation is set", async () => {
    const evaluator = new LocalFeatureFlagEvaluator(definitions([makeFlag("not-pro", { filters: { groups: [personCondition("plan", "pro", "exact", true)] } })]));

    expect(await evaluator.getFeatureFlag("not-pro", "user", {}, { plan: "pro" })).toBe(false);
    expect(await evaluator.getFeatureFlag("not-pro", "user", {}, { plan: "free" })).toBe(true);
  });

  test("an is_not_set condition is inconclusive when the property is omitted", async () => {
    const evaluator = new LocalFeatureFlagEvaluator(definitions([makeFlag("only-anon", { filters: { groups: [personCondition("email", "", "is_not_set")] } })]));

    expect(await evaluator.getFeatureFlag("only-anon", "user", {}, {})).toBeUndefined();
    expect(await evaluator.getFeatureFlag("only-anon", "user", {}, { email: "a@example.com" })).toBe(false);
  });

  test("answers a multivariate flag's variant override, and assigns variants by hash without one, stably", async () => {
    const variants = { variants: [{ key: "left", rollout_percentage: 50 }, { key: "right", rollout_percentage: 50 }] };
    const evaluator = new LocalFeatureFlagEvaluator(
      definitions([
        makeFlag("pinned", { filters: { groups: [{ properties: [], rollout_percentage: 100, variant: "right" }], multivariate: variants } }),
        makeFlag("split", { filters: { groups: [{ properties: [], rollout_percentage: 100 }], multivariate: variants } }),
      ]),
    );

    expect(await evaluator.getFeatureFlag("pinned", "user")).toBe("right");
    const seen = new Set<unknown>();
    for (const id of ["alice", "bob", "carol", "dave", "eve", "frank"]) {
      const value = await evaluator.getFeatureFlag("split", id);
      expect(["left", "right"]).toContain(value);
      expect(await evaluator.getFeatureFlag("split", id), "the same ID gets the same variant").toBe(value);
      seen.add(value);
    }
    expect(seen).toEqual(new Set(["left", "right"]));
  });

  test("a rollout percentage is the same for the same ID, and splits IDs by PostHog's hash", async () => {
    const evaluator = new LocalFeatureFlagEvaluator(definitions([makeFlag("half", { filters: { groups: [{ properties: [], rollout_percentage: 50 }] } })]));

    expect(await evaluator.getFeatureFlag("half", "stable-distinct-id")).toBe(await evaluator.getFeatureFlag("half", "stable-distinct-id"));
    // PostHog's hash: SHA-1 of "<key>.<id>", its first 15 hex digits over 0xfffffffffffffff.
    for (const id of ["id-1", "id-2", "id-3", "id-4", "id-5", "id-6"]) expect(await evaluator.getFeatureFlag("half", id), id).toBe((await rolloutHash("half", id)) <= 0.5);
  });

  test("is undefined with experience continuity, for a cohort it doesn't have, and for a cohort with a flag dependency", async () => {
    const evaluator = new LocalFeatureFlagEvaluator(
      definitions(
        [
          makeFlag("continuity", { ensure_experience_continuity: true }),
          makeFlag("static-cohort", { filters: { groups: [{ properties: [{ key: "id", type: "cohort", value: 7 }], rollout_percentage: 100 }] } }),
          makeFlag("cohort-flag", { filters: { groups: [{ properties: [{ key: "id", value: "with-dependency", operator: "in", type: "cohort" }], rollout_percentage: 100 }] } }),
        ],
        { cohorts: { "with-dependency": { type: "AND", values: [{ key: "plan", value: "pro", operator: "exact", type: "person" }, { key: "other-flag", value: true, type: "flag" }] } } },
      ),
    );

    expect(await evaluator.getFeatureFlag("continuity", "user")).toBeUndefined();
    expect(await evaluator.getFeatureFlag("static-cohort", "user")).toBeUndefined();
    expect(await evaluator.getFeatureFlag("cohort-flag", "user", {}, { plan: "pro" })).toBeUndefined();
  });
});

describe("the copied evaluator's licence", () => {
  test("ships beside it: the package's LICENSE file, which each copied file's header points to", () => {
    const licence = readFileSync(new URL("./LICENSE", import.meta.url), "utf8");

    expect(licence.startsWith("Copyright 2020 Posthog / Hiberly, Inc."), "the package's own LICENSE").toBe(true);
    expect(licence).toContain("Apache License");
    for (const file of ["evaluator.ts", "match-property.ts", "types.ts"]) {
      expect(readFileSync(new URL(`./${file}`, import.meta.url), "utf8").split("\n").slice(0, 8).join("\n"), file).toContain("./LICENSE");
    }
  });
});

async function rolloutHash(key: string, id: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${key}.${id}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return parseInt(hex.slice(0, 15), 16) / 0xfffffffffffffff;
}
