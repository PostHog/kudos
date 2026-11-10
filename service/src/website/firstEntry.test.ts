// A member's first entry through SSO runs today's sign-in effects once: the `users` row with their Slack pair, the later
// verification when the directory doesn't know them yet, and `memberGreeted` with the welcome item. Entries after the
// first, and a member who signed in before the move, write nothing. Today's convex/website/signIn.test.ts proves the
// Slack sign-in around these effects (S15's), and convex/album/items/welcomeItem.test.ts what the greeting earns (S8's).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
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
  test("enters with their own users row, and nothing is written or published", async () => {
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
    const member = await aMember("U_JUNO");

    await enters(juno);

    expect(await greetings()).toEqual([expect.objectContaining({ type: "memberGreeted", workspace: allowedWorkspace, member, owesTheWelcomeItem: true, at: t.clock.now() })]);
  });

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
