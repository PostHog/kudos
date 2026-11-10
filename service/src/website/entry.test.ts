// The website entry: the page load that signs a person in, `POST /api/entry`, which runs today's sign-in effects when
// they're due and writes nothing otherwise. Every case asks the real app, behind the real identity and member check.
// The effects themselves are S17's `rememberSignedInMember` and S3's verification, so the cases that reach them wait.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { slackError } from "../../testing/fakeSlack.ts";
import { definitionsStored, offForEveryone } from "../../testing/flags.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { websiteOpenIn, websiteRequest } from "../../testing/website.ts";
import { NotPortedError } from "../notPorted.ts";
import type { Operations } from "../operations.ts";
import type { Registry, Routes } from "../registration.ts";
import { serviceRegistry } from "../registry.ts";
import { memberRead } from "./api/route.ts";
import { apiHeader } from "./api/transport.ts";
import { edgeEmailHeader } from "./identity.ts";
import { websiteApi } from "./registration.ts";

const whoAmI = memberRead("website.test.whoAmI", {}, async (_ctx, me) => me);

// The HTTP layer answers a stub's NotPortedError with a bare 500; the operations the API runs hand it to the test.
let reached: NotPortedError | undefined;
function handingOn(operations: Operations): Operations {
  const noting = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof NotPortedError) reached ??= error;
      throw error;
    }
  };
  return { ...operations, query: (name, handler) => noting(() => operations.query(name, handler)), mutation: (name, handler) => noting(() => operations.mutation(name, handler)) };
}
const api: Routes = (runtime) => websiteApi([whoAmI])({ ...runtime, operations: handingOn(runtime.operations) });

const registry: Registry = { ...serviceRegistry, routes: [api] };
const backend = useTestBackend({ registry });

beforeEach(() => {
  reached = undefined;
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const juno = (t: TestBackend) => t.seed.insert("members", { workspace: "T1", user: "U_JUNO", kind: "member", email: "juno@example.com", name: "Juno Whitlock", picture: "https://example.com/juno.png" });
const as = (email: string) => ({ [edgeEmailHeader]: email });

async function sent(t: TestBackend, path: string, email?: string, args: unknown = {}): Promise<Response> {
  const answer = await t.app.request(path, websiteRequest(args, email));
  if (reached) throw reached;
  return answer;
}

async function entered(t: TestBackend, email?: string): Promise<unknown> {
  const answer = await sent(t, "/api/entry", email);
  expect(answer.status, "the entry answers").toBe(200);
  return answer.json();
}

const greetings = async (t: TestBackend) => (await t.published()).filter(({ type }) => type === "memberGreeted");

describe("an entry that writes nothing", () => {
  test("signed out, not a member, or closed: the denial, and no users row, verification or greeting", async () => {
    const t = backend();
    await websiteOpenIn(t);
    await juno(t);

    expect(await entered(t)).toEqual({ kind: "signed-out" });
    expect(await entered(t, "stranger@example.com")).toEqual({ kind: "not-a-member" });
    await definitionsStored(t.operations, offForEveryone("website"));
    expect(await entered(t, "juno@example.com")).toEqual({ kind: "closed" });

    expect(await t.seed.all("users")).toEqual([]);
    expect(await t.seed.all("memberVerifications")).toEqual([]);
    expect(await greetings(t)).toEqual([]);
  });

  test("a member who has entered before enters again with one read and no write", async () => {
    const t = backend();
    await websiteOpenIn(t);
    await juno(t);
    await t.seed.insert("users", { chatIdentity: { workspace: "T1", user: "U_JUNO" }, name: "Juno W." });
    const before = await t.seed.all("users");

    expect(await entered(t, "juno@example.com")).toEqual({ kind: "entered" });
    expect(await t.seed.all("users"), "the row is as it was").toEqual(before);
    expect(await greetings(t)).toEqual([]);
  });

  test("a read never enters: a member's reads leave them with no users row", async () => {
    const t = backend();
    await websiteOpenIn(t);
    await juno(t);

    const answer = await sent(t, `/api/query/${whoAmI.name}`, "juno@example.com");

    expect(await answer.json()).toEqual(expect.objectContaining({ user: "U_JUNO" }));
    expect(await t.seed.all("users")).toEqual([]);
  });

  test("is the website's own request with no arguments, refused before anyone is looked up", async () => {
    const t = backend();
    await websiteOpenIn(t);
    // An email only Slack could resolve, with Slack failing: looking anyone up first would answer 500.
    t.slack.answering("users.lookupByEmail", ...Array.from({ length: 5 }, () => slackError("internal_error")));
    const stranger = as("stranger@example.com");

    const crossSite = await t.app.request("/api/entry", { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site", [apiHeader]: "1", ...stranger }, body: "{}" });
    const withoutHeader = await t.app.request("/api/entry", { method: "POST", headers: { "content-type": "application/json", ...stranger }, body: "{}" });
    const withArguments = await sent(t, "/api/entry", "stranger@example.com", { as: "U_RAVI" });
    const byGet = await t.app.request("/api/entry", { headers: { [apiHeader]: "1", ...stranger } });

    expect([crossSite.status, withoutHeader.status, withArguments.status, byGet.status]).toEqual([403, 403, 400, 404]);
    expect(await t.seed.all("users")).toEqual([]);
  });
});

describe("an entry that signs someone in", () => {
  waitsOn(["S17"], "a member's first entry makes their users row with the directory's name and picture, and greets them once", async () => {
    const t = backend();
    await websiteOpenIn(t);
    const member = await juno(t);

    expect(await entered(t, "juno@example.com")).toEqual({ kind: "entered" });
    expect(await entered(t, "juno@example.com"), "a second page load").toEqual({ kind: "entered" });

    expect(await t.seed.all("users")).toEqual([expect.objectContaining({ chatIdentity: { workspace: "T1", user: "U_JUNO" }, name: "Juno Whitlock", image: "https://example.com/juno.png" })]);
    expect(await greetings(t)).toEqual([expect.objectContaining({ workspace: "T1", member })]);
  });

  waitsOn(["S17"], "two first entries at once make one users row and one greeting", async () => {
    const t = backend();
    await websiteOpenIn(t);
    await juno(t);

    // Both finish before the test goes on, even when one fails: a transaction left running would hold the next test's tables.
    const both = await Promise.allSettled([entered(t, "juno@example.com"), entered(t, "juno@example.com")]);
    for (const answer of both) if (answer.status === "rejected") throw answer.reason;
    expect(both.map((answer) => answer.status === "fulfilled" && answer.value)).toEqual([{ kind: "entered" }, { kind: "entered" }]);

    expect(await t.seed.all("users")).toHaveLength(1);
    expect(await greetings(t)).toHaveLength(1);
  });

  waitsOn(["S3", "S17"], "a person only Slack knows is verified once, however often they load a page while it runs", async () => {
    const t = backend();
    await websiteOpenIn(t);
    t.slack.withMember("U_NEW", { profile: { email: "new.joiner@example.com" } });

    expect(await entered(t, "new.joiner@example.com")).toEqual({ kind: "verifying" });
    expect(await entered(t, "new.joiner@example.com")).toEqual({ kind: "verifying" });

    expect(await t.seed.all("memberVerifications")).toHaveLength(1);
  });
});
