// What PostHog's answer must hold to replace the last good row: every field the copied evaluator reads (evaluator.ts,
// match-property.ts and the @posthog/core functions they call), with its type, or the whole answer is refused.
import { describe, expect, test } from "vitest";
import { FakePostHog } from "../../testing/fakePostHog.ts";
import { onForEmails, onForEveryone, onForPercent, onInTheSandboxOnly, variantForEveryone } from "../../testing/flags.ts";
import { parseDefinitions } from "./definitions.ts";

type Body = Record<string, any>;

// A valid answer that reaches every field the evaluator reads, so each malformed case below breaks exactly one.
const everyField = (): Body => ({
  flags: [
    {
      id: 1,
      name: "sandbox-only",
      key: "sandbox-only",
      active: true,
      deleted: false,
      ensure_experience_continuity: false,
      bucketing_identifier: "distinct_id",
      rollout_percentage: null,
      experiment_set: [],
      filters: {
        aggregation_group_type_index: null,
        groups: [
          {
            properties: [{ key: "environment", type: "person", operator: "exact", value: ["sandbox"], negation: false }],
            rollout_percentage: 100,
            variant: "compact",
            aggregation_group_type_index: null,
          },
          { properties: [{ key: "id", type: "cohort", value: 7 }], rollout_percentage: 50 },
          { properties: [{ key: "other-flag", type: "flag", value: true, operator: "flag_evaluates_to", dependency_chain: ["other-flag"] }] },
        ],
        multivariate: { variants: [{ key: "control", rollout_percentage: 50 }, { key: "compact", rollout_percentage: 50 }] },
        payloads: { compact: '{"columns":2}', true: "plain" },
      },
    },
    { key: "other-flag", active: true, filters: { groups: [{ properties: [], rollout_percentage: 100 }] } },
  ],
  group_type_mapping: { "0": "workspace" },
  cohorts: {
    "7": {
      type: "OR",
      values: [{ type: "AND", values: [{ key: "email", type: "person", operator: "icontains", value: "@example.com", negation: false }] }],
    },
  },
  property_matching_version: 2,
});

const flag = (body: Body) => body.flags[0];
const firstProperty = (body: Body) => flag(body).filters.groups[0].properties[0];
const deepCohortProperty = (body: Body) => body.cohorts["7"].values[0].values[0];

describe("the definitions check", () => {
  // The fakes server's production set (e2e/fakes/productionFlags.ts) is checked beside it, in e2e/fakes/server.test.ts.
  test("passes PostHog's real answers: the full shape, an empty flags list, production's shape and the fixture builders", () => {
    const answers: Record<string, unknown> = {
      "every field the evaluator reads": everyField(),
      "an empty flags list": { flags: [] },
      "an empty answer as PostHog sends it": { flags: [], group_type_mapping: {}, cohorts: {} },
      "production's shape, every flag on for everyone": new FakePostHog().withFlags(...["album", "everyone-board", "xp-levels"].map(onForEveryone)).definitionsBody(),
      "the fixture builders": new FakePostHog()
        .withFlags(onForEveryone("a"), onInTheSandboxOnly("b"), onForEmails("c", "alice@example.com"), variantForEveryone("d", "compact"), onForPercent("e", 25))
        .definitionsBody(),
      "nullable fields sent as null": {
        flags: [{ key: "a", active: true, ensure_experience_continuity: null, bucketing_identifier: null, filters: { groups: [{ properties: null, rollout_percentage: null, variant: null }], multivariate: null, payloads: null } }],
      },
      "a property set or unset, whatever its value": {
        flags: [{ key: "a", active: true, filters: { groups: [{ properties: [{ key: "plan", type: "person", operator: "is_set", value: null }, { key: "trial", type: "person", operator: "is_not_set" }] }] } }],
      },
      "a payload that is already JSON": { flags: [{ key: "a", active: true, filters: { groups: [], payloads: { true: { columns: 2 } } } }] },
    };

    for (const [name, body] of Object.entries(answers)) expect(parseDefinitions(body), name).not.toBeNull();
  });

  test("keeps what PostHog sends beside the fields it checks, and names the answer's parts as the evaluator does", () => {
    const parsed = parseDefinitions(everyField());

    expect(parsed?.flags[0]).toEqual(everyField().flags[0]);
    expect(parsed?.groupTypeMapping).toEqual({ "0": "workspace" });
    expect(parsed?.cohorts).toEqual(everyField().cohorts);
    expect(parsed?.propertyMatchingVersion).toBe(2);
  });

  test("refuses an answer with any field the evaluator reads malformed, however deep", () => {
    const malformed: Record<string, (body: Body) => void> = {
      "a string negation": (body) => (firstProperty(body).negation = "false"),
      "no value for an operator that compares one": (body) => (firstProperty(body).value = null),
      "a non-numeric condition rollout percentage": (body) => (flag(body).filters.groups[0].rollout_percentage = "100"),
      "a rollout percentage above 100": (body) => (flag(body).filters.groups[1].rollout_percentage = 150),
      "a malformed property deep in a cohort": (body) => (deepCohortProperty(body).negation = "true"),
      "a cohort property without a key": (body) => delete deepCohortProperty(body).key,
      "a cohort group of an unknown type": (body) => (body.cohorts["7"].values[0].type = "XOR"),
      "a cohort mixing groups and properties": (body) => body.cohorts["7"].values.push({ key: "plan", type: "person", value: "pro" }),
      "a variant without a numeric percentage": (body) => (flag(body).filters.multivariate.variants[1].rollout_percentage = "50"),
      "a variant without a key": (body) => delete flag(body).filters.multivariate.variants[0].key,
      "variants that aren't a list": (body) => (flag(body).filters.multivariate.variants = { control: 50 }),
      "a non-string variant override": (body) => (flag(body).filters.groups[0].variant = 1),
      "a string active": (body) => (flag(body).active = "true"),
      "a missing active": (body) => delete flag(body).active,
      "a string ensure_experience_continuity": (body) => (flag(body).ensure_experience_continuity = "false"),
      "an unknown bucketing identifier": (body) => (flag(body).bucketing_identifier = "account_id"),
      "a non-string flag key": (body) => (flag(body).key = 7),
      "filters that aren't an object": (body) => (flag(body).filters = "everyone"),
      "conditions that aren't a list": (body) => (flag(body).filters.groups = { properties: [] }),
      "condition properties that aren't a list": (body) => (flag(body).filters.groups[0].properties = { key: "environment" }),
      "a string aggregation group type index": (body) => (flag(body).filters.aggregation_group_type_index = "0"),
      "a string condition aggregation group type index": (body) => (flag(body).filters.groups[0].aggregation_group_type_index = "0"),
      "a non-string property type": (body) => (firstProperty(body).type = 1),
      "a non-string operator": (body) => (firstProperty(body).operator = ["exact"]),
      "an object property value": (body) => (firstProperty(body).value = { environment: "sandbox" }),
      "a missing property value": (body) => delete firstProperty(body).value,
      "a dependency chain that isn't a list of keys": (body) => (flag(body).filters.groups[2].properties[0].dependency_chain = "other-flag"),
      "a non-JSON payload": (body) => (flag(body).filters.payloads = { compact: () => 2 }),
      "a non-string group type": (body) => (body.group_type_mapping = { "0": 0 }),
      "a string property matching version": (body) => (body.property_matching_version = "2"),
      "flags that aren't a list": (body) => (body.flags = { "sandbox-only": flag(body) }),
    };

    for (const [name, breakIt] of Object.entries(malformed)) {
      const body = everyField();
      breakIt(body);
      expect(parseDefinitions(body), name).toBeNull();
    }
  });
});
