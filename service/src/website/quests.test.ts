// The quests panel's read passes the website's one guard: today's convex/website/quests.test.ts, on the service's test
// backend. Each read goes through the whole app by its route name, signed in through SSO or not at all, so the app's own
// identity mapping and member check (S15) answer it; until S15 ports them, a request that reaches them waits on S15.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { argumentsRefused, signedInThroughSso, websiteAs } from "./routesTesting.ts";

const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const rowan = { user: "U_ROWAN", name: "Rowan Pike" };
const mondayPathFlags = ["xp-levels", "monday-quest"];

const backend = useTestBackend({ now: now.getTime(), workspace: "T1" });

let t: TestBackend;

beforeEach(() => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
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

// Today's switchWebsite(t, postHog, open, ...flags): the definitions PostHog serves, and the workspace's key made.
async function switchWebsite(open: boolean, ...alsoOn: string[]) {
  await definitionsStored(t.operations, open ? onForEveryone("website") : offForEveryone("website"), ...alsoOn.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

function onTheMondayPath() {
  return switchWebsite(true, ...mondayPathFlags);
}

function aMember(user: string, kind: "member" | "not-a-member" = "member") {
  return t.seed.insert("members", { workspace: "T1", user, kind, asOf: 0 });
}

/** Today's `aSession`: the person signs in, through SSO here; there is no session of the app's own to outlive. */
function aSession(person: { user: string }) {
  return signedInThroughSso(t, person);
}

async function signedIn(person = juno) {
  await aMember(person.user);
  return { asSignedIn: await aSession(person) };
}

describe("website reads pass one guard", () => {
  waitsOn(["S15"], "getQuests reads closed while the website flag is off, even on the Monday path", async () => {
    await onTheMondayPath();
    const { asSignedIn } = await signedIn();
    await switchWebsite(false, ...mondayPathFlags);

    expect(await asSignedIn.read("website.quests.getQuests", {})).toEqual({ kind: "closed" });
  });

  waitsOn(["S15"], "getQuests reads signed out without a session", async () => {
    await onTheMondayPath();

    expect(await websiteAs(t, null).read("website.quests.getQuests", {})).toEqual({ kind: "signed-out" });
  });

  waitsOn(["S15"], "getQuests reads not-a-member for a former member with a live session", async () => {
    await onTheMondayPath();
    await aMember(juno.user, "not-a-member");
    const asSignedIn = await aSession(juno);

    expect(await asSignedIn.read("website.quests.getQuests", {})).toEqual({ kind: "not-a-member" });
  });

  test("an argument that names another member is rejected by the validator", async () => {
    await onTheMondayPath();
    const { asSignedIn } = await signedIn();
    const withAnotherMember = { user: rowan.user };

    await expect(asSignedIn.read("website.quests.getQuests", withAnotherMember)).rejects.toThrow(argumentsRefused);
  });
});
