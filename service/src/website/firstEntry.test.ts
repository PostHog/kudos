// A member's first entry through SSO runs today's sign-in effects once: the `users` row with their Slack pair, the later
// verification when the directory doesn't know them yet, and `memberGreeted` with the welcome item. Entries after the
// first, and a member who signed in before the move, write nothing; a later entry of a person the directory doesn't know
// starts a fresh check after a failed one. Today's convex/website/signIn.test.ts, on the service's test backend; its
// sweep of stranded verifications is verifyMember's own (S3's), and convex/album/items/welcomeItem.test.ts proves what
// the greeting earns (S8's).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { httpStatus, rateLimitedFor } from "../../testing/fakeSlack.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { MemberId } from "../workspace/directory.ts";
import { rememberSignedInMember, SignInRefused, type SignedIn } from "./signIn.ts";

const allowedWorkspace = "T1";
const backend = useTestBackend({ now: new Date("2026-10-13T10:00:00Z").getTime(), workspace: allowedWorkspace });

const juno: SignedIn = {
  workspace: allowedWorkspace,
  user: "U_JUNO",
  name: "Juno Whitlock",
  givenName: "Juno",
  familyName: "Whitlock",
  image: "https://avatars.example.test/juno.png",
};

let t: TestBackend;

beforeEach(async () => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", allowedWorkspace);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  t = backend();
  await definitionsStored(t.operations, onForEveryone("website"));
});

afterEach(() => void vi.unstubAllEnvs());

const enters = (signedIn: SignedIn) => t.run((ctx) => rememberSignedInMember(ctx, signedIn));
const aMember = (user: string, kind: "member" | "not-a-member" = "member") =>
  t.seed.insert("members", { workspace: allowedWorkspace, user, kind, asOf: 0 }) as Promise<MemberId>;
// The refusal an entry ends in; any other error, a stub's included, fails the test as itself.
const refusalOf = (entry: Promise<unknown>) =>
  entry.then(
    () => undefined,
    (error: unknown) => {
      if (error instanceof SignInRefused) return error;
      throw error;
    },
  );
const greetings = async () => (await t.published()).filter(({ type }) => type === "memberGreeted");

describe("a member who signed in before the move", () => {
  waitsOn(["S3"], "enters with their own users row, and nothing is written or published", async () => {
    await aMember("U_JUNO");
    const before = await t.seed.insert("users", { name: "Juno Whitlock", chatIdentity: { workspace: allowedWorkspace, user: "U_JUNO" } });

    expect(await enters({ ...juno, name: "Juno Ashby" })).toBe(before);

    expect(await t.seed.all("users")).toEqual([expect.objectContaining({ _id: before, name: "Juno Whitlock" })]);
    expect(await t.published()).toEqual([]);
  });
});

describe("only the allowed workspace enters", () => {
  test("a Slack pair from another workspace is refused and no account appears", async () => {
    const refused = await refusalOf(enters({ ...juno, workspace: "T_OTHER" }));

    expect(refused).toBeInstanceOf(SignInRefused);
    expect(refused).toMatchObject({ reason: "another-workspace" });
    expect(await t.seed.all("users")).toEqual([]);
  });

  test("a Slack pair with an empty user is refused and no account appears", async () => {
    await expect(enters({ ...juno, user: "" })).rejects.toThrow(/user_id/);
    expect(await t.seed.all("users")).toEqual([]);
  });

  test("an unset SLACK_WORKSPACE_ID refuses every entry", async () => {
    vi.stubEnv("SLACK_WORKSPACE_ID", "");

    await expect(enters(juno)).rejects.toMatchObject({ reason: "another-workspace" });
    expect(await t.seed.all("users")).toEqual([]);
  });

  test("a users row in another workspace is not theirs", async () => {
    await t.seed.insert("users", { chatIdentity: { workspace: "T_OTHER", user: "U_JUNO" } });

    await expect(enters({ ...juno, workspace: "T_OTHER" })).rejects.toBeInstanceOf(SignInRefused);
  });
});

describe("the first entry", () => {
  waitsOn(["S3", "S8", "S15"], "keeps the Slack pair and the display fields, and no email", async () => {
    await aMember("U_JUNO");

    const user = await enters(juno);

    const rows = await t.seed.all("users");
    expect(rows).toEqual([
      {
        _id: user,
        _creationTime: expect.any(Number),
        name: "Juno Whitlock",
        givenName: "Juno",
        familyName: "Whitlock",
        image: juno.image,
        chatIdentity: { workspace: allowedWorkspace, user: "U_JUNO" },
      },
    ]);
  });

  waitsOn(["S3", "S8", "S15"], "leaves out a display field that is empty", async () => {
    await aMember("U_JUNO");

    await enters({ workspace: allowedWorkspace, user: "U_JUNO", name: "Juno", image: "" });

    const [row] = await t.seed.all("users");
    expect(row).not.toHaveProperty("image");
    expect(row).toMatchObject({ name: "Juno" });
  });

  waitsOn(["S3", "S8", "S15"], "greets a member once, with the welcome item they are owed", async () => {
    await definitionsStored(t.operations, onForEveryone("website"), onForEveryone("welcome-item"), onForEveryone("hidden-items"));
    const member = await aMember("U_JUNO");

    await enters(juno);

    expect(await greetings()).toEqual([expect.objectContaining({ type: "memberGreeted", workspace: allowedWorkspace, member, owesTheWelcomeItem: true, at: t.clock.now() })]);
  });

  // The welcome item is owed only while welcome-item and hidden-items are both on (convex/album/items/welcome.ts).
  for (const off of ["welcome-item", "hidden-items"]) {
    waitsOn(["S3", "S8", "S15"], `greets a member owed no welcome item while ${off} is off`, async () => {
      const on = ["welcome-item", "hidden-items"].filter((key) => key !== off);
      await definitionsStored(t.operations, onForEveryone("website"), offForEveryone(off), ...on.map(onForEveryone));
      await aMember("U_JUNO");

      await enters(juno);

      expect(await greetings()).toEqual([expect.objectContaining({ type: "memberGreeted", owesTheWelcomeItem: false })]);
    });
  }

  waitsOn(["S3", "S8", "S15"], "a second entry finds the same users row and greets nobody again", async () => {
    await aMember("U_JUNO");
    const first = await enters(juno);

    expect(await enters(juno)).toBe(first);

    expect(await t.seed.all("users")).toHaveLength(1);
    expect(await greetings()).toHaveLength(1);
  });

  waitsOn(["S3", "S15"], "a person the directory knows as not a member gets a users row and no greeting", async () => {
    await aMember("U_JUNO", "not-a-member");

    await enters(juno);

    expect(await t.seed.all("users")).toHaveLength(1);
    expect(await greetings()).toEqual([]);
  });

  waitsOn(["S3", "S15"], "a person the directory doesn't know yet is verified later, with no greeting", async () => {
    await enters(juno);

    expect(await t.seed.all("memberVerifications")).toEqual([expect.objectContaining({ workspace: allowedWorkspace, user: "U_JUNO" })]);
    expect(await t.seed.all("users")).toHaveLength(1);
    expect(await greetings()).toEqual([]);
  });

  waitsOn(["S3", "S15"], "while the website is closed the entry is refused and no account appears", async () => {
    await aMember("U_JUNO");
    await definitionsStored(t.operations, offForEveryone("website"));

    const refused = await refusalOf(enters(juno));

    expect(refused).toMatchObject({ reason: "closed" });
    expect(await t.seed.all("users")).toEqual([]);
    expect(await t.published()).toEqual([]);
  });
});

// WS8. Today's test read the outcome off the profile page; this one reads the verification and the directory row the page
// reads, since the page is 17.2's.
describe("WS8: a person the directory doesn't know yet is verified with users.info", () => {
  const verification = async () => (await t.seed.all("memberVerifications"))[0];
  const directory = () => t.seed.all("members");
  // Runs the verification's tries as they come due, as today's `settleInTimeOrder`; a try waits a minute at most here.
  async function settleTheChecks() {
    for (let step = 0; step < 20; step += 1) {
      await t.settle();
      if ((await verification())?.state !== "pending") return;
      t.time.advance(60_000);
    }
  }

  waitsOn(["S3", "S15"], "they read verifying, then member once users.info answers, with the directory filled", async () => {
    t.slack.withMember("U_JUNO", { tz: "Europe/London" });
    await enters(juno);
    expect(await verification()).toMatchObject({ state: "pending" });

    await t.settle();

    expect(await directory()).toEqual([expect.objectContaining({ workspace: allowedWorkspace, user: "U_JUNO", kind: "member" })]);
    expect(t.slack.callsTo("users.info")).toEqual([{ user: "U_JUNO" }]);
  });

  waitsOn(["S3", "S15"], "a person users.info knows as deleted reads not-a-member", async () => {
    t.slack.withMember("U_JUNO", { deleted: true });
    await enters(juno);

    await t.settle();

    expect(await directory()).toEqual([expect.objectContaining({ user: "U_JUNO", kind: "not-a-member" })]);
  });

  waitsOn(["S3", "S15"], "after 3 failed lookups, each waiting the Retry-After Slack asked for, they read unverified and the directory stays empty", async () => {
    t.slack.withMember("U_JUNO").answering("users.info", rateLimitedFor(30), rateLimitedFor(30), httpStatus(500));
    const start = t.clock.now();
    await enters(juno);

    await settleTheChecks();

    expect(await verification()).toMatchObject({ state: "failed" });
    expect(t.slack.timesOf("users.info").map((at) => (at - start) / 1000)).toEqual([0, 30, 60]);
    expect(await directory()).toEqual([]);
  });

  waitsOn(["S3", "S15"], "a person users.info keeps answering ok without a user for reads unverified after the retries", async () => {
    const okWithoutUser = () => Response.json({ ok: true });
    t.slack.withMember("U_JUNO").answering("users.info", okWithoutUser, okWithoutUser, okWithoutUser);
    await enters(juno);

    await settleTheChecks();

    expect(await verification()).toMatchObject({ state: "failed" });
    expect(t.slack.callsTo("users.info")).toHaveLength(3);
  });

  waitsOn(["S3", "S15"], "entering again after a failed verification starts a fresh check", async () => {
    t.slack.withMember("U_JUNO").answering("users.info", httpStatus(500), httpStatus(500), httpStatus(500));
    const user = await enters(juno);
    await settleTheChecks();
    expect(await verification()).toMatchObject({ state: "failed" });

    expect(await enters(juno)).toBe(user);
    expect(await verification()).toMatchObject({ state: "pending" });
    await settleTheChecks();

    expect(await directory()).toEqual([expect.objectContaining({ user: "U_JUNO", kind: "member" })]);
    expect(t.slack.callsTo("users.info")).toHaveLength(4);
  });

  waitsOn(["S3", "S15"], "entering again while a check is pending asks Slack once", async () => {
    t.slack.withMember("U_JUNO");
    await enters(juno);
    await enters(juno);

    await t.settle();

    expect(t.slack.callsTo("users.info")).toHaveLength(1);
  });

  waitsOn(["S3", "S15"], "a member the directory already knows is not looked up", async () => {
    await aMember("U_JUNO");
    await enters(juno);
    await t.settle();

    expect(t.slack.callsTo("users.info")).toEqual([]);
  });
});
