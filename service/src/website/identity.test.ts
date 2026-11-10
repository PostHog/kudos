// Who a website request is. The edge signs the browser in through single sign-on and names it by email in
// `x-auth-request-email`, on the API's paths only; the service maps that email to the member it is, through the
// directory or else Slack, and today's member check answers. Ports convex/slack/signIn.test.ts's concern, who a
// signed-in browser is, from Slack's sign-in claims to the email the edge asserts. Every case asks the real app.
import { Hono } from "hono";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { slackError } from "../../testing/fakeSlack.ts";
import { definitionsStored, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { NotPortedError } from "../notPorted.ts";
import type { Operations } from "../operations.ts";
import type { Registry, Routes } from "../registration.ts";
import { serviceRegistry } from "../registry.ts";
import { memberCommand, memberRead } from "./api/route.ts";
import { apiHeader } from "./api/transport.ts";
import { websiteApi } from "./registration.ts";

const whoAmI = memberRead("website.test.whoAmI", {}, async (_ctx, me) => me);
const touch = memberCommand("website.test.touch", {}, async (_ctx, me, person) => ({ touchedBy: me.user, admin: person.admin }));

// A route of no API path that answers which identity headers reached it, as any public page or Slack's routes would see them.
const headersProbe: Routes = () =>
  new Hono().all("/probe/*", (c) => c.json(Object.fromEntries([...c.req.raw.headers].filter(([name]) => /^x[-_]auth[-_]request/i.test(name)))));

// The HTTP layer answers a stub's NotPortedError with a bare 500; the operations the API runs hand it to the test.
let reached: NotPortedError | undefined;
const handingOnStubs = (routes: Routes): Routes => (runtime) => routes({ ...runtime, operations: handingOn(runtime.operations) });
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

const registry: Registry = { ...serviceRegistry, routes: [handingOnStubs(websiteApi([whoAmI, touch])), headersProbe] };
const backend = useTestBackend({ registry });

beforeEach(() => {
  reached = undefined;
  postHogDeciding("sandbox");
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
});

async function websiteOpen(t: TestBackend, open = true) {
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
  await definitionsStored(t.operations, open ? onForEveryone("website") : offForEveryone("website"));
}

async function juno(t: TestBackend, fields: Record<string, unknown> = {}) {
  return t.seed.insert("members", { workspace: "T1", user: "U_JUNO", kind: "member", email: "Juno.Whitlock@example.com", ...fields });
}

async function asked(t: TestBackend, route: string, headers: Record<string, string> = {}): Promise<unknown> {
  const kind = route === touch.name ? "mutation" : "query";
  const answer = await t.app.request(`/api/${kind}/${route}`, { method: "POST", headers: { "content-type": "application/json", [apiHeader]: "1", ...headers }, body: "{}" });
  if (reached) throw reached;
  expect(answer.status, "the API answers").toBe(200);
  return answer.json();
}

const as = (email: string) => ({ "x-auth-request-email": email });
const lookups = (t: TestBackend) => t.slack.calls.filter(({ method }) => method === "users.lookupByEmail").map(({ args }) => args.email);

describe("the email the edge asserts", () => {
  test("names the member whose directory entry holds it, in any case, with the display fields of their users row, and asks Slack nothing", async () => {
    const t = backend();
    await websiteOpen(t);
    const member = await juno(t);
    await t.seed.insert("users", { chatIdentity: { workspace: "T1", user: "U_JUNO" }, name: "Juno Whitlock", givenName: "Juno", image: "https://example.com/juno.png" });

    expect(await asked(t, whoAmI.name, as("juno.whitlock@EXAMPLE.com"))).toEqual({
      member,
      workspace: "T1",
      user: "U_JUNO",
      name: "Juno Whitlock",
      givenName: "Juno",
      image: "https://example.com/juno.png",
    });
    expect(lookups(t), "the directory knew the email").toEqual([]);
  });

  test("names a member who has no users row yet by their chat identity alone", async () => {
    const t = backend();
    await websiteOpen(t);
    const member = await juno(t);

    expect(await asked(t, whoAmI.name, as("juno.whitlock@example.com"))).toEqual({ member, workspace: "T1", user: "U_JUNO" });
  });

  test("a request the edge named nobody in is signed out, and so is one whose only email header is spelled with underscores", async () => {
    const t = backend();
    await websiteOpen(t);
    await juno(t);

    expect(await asked(t, whoAmI.name)).toEqual({ kind: "signed-out" });
    expect(await asked(t, whoAmI.name, as("  "))).toEqual({ kind: "signed-out" });
    expect(await asked(t, whoAmI.name, { x_auth_request_email: "juno.whitlock@example.com" })).toEqual({ kind: "signed-out" });
    expect(lookups(t), "nobody to look up").toEqual([]);
  });

  test("with no sign-in workspace set, nobody is signed in", async () => {
    const t = backend();
    await websiteOpen(t);
    await juno(t);
    vi.stubEnv("SLACK_WORKSPACE_ID", "");

    expect(await asked(t, whoAmI.name, as("juno.whitlock@example.com"))).toEqual({ kind: "closed" });
  });

  test("an email the directory lacks and Slack doesn't know is not a member's", async () => {
    const t = backend();
    await websiteOpen(t);
    await juno(t);

    expect(await asked(t, whoAmI.name, as("stranger@example.com"))).toEqual({ kind: "not-a-member" });
    expect(lookups(t), "Slack was asked").toEqual(["stranger@example.com"]);
  });

  test("an email Slack knows for a person of another workspace is not a member's", async () => {
    const t = backend();
    await websiteOpen(t);
    t.slack.withMember("U_GUEST", { team_id: "T2", profile: { email: "guest@example.com" } });

    expect(await asked(t, whoAmI.name, as("guest@example.com"))).toEqual({ kind: "not-a-member" });
  });

  test("an email two directory entries hold names nobody, logged without the email", async () => {
    const t = backend();
    await websiteOpen(t);
    await juno(t);
    await t.seed.insert("members", { workspace: "T1", user: "U_JUNO_2", kind: "member", email: "juno.whitlock@example.com" });

    expect(await asked(t, whoAmI.name, as("juno.whitlock@example.com"))).toEqual({ kind: "not-a-member" });
    const warned = t.logs.filter(({ message }) => message === "two directory entries hold one email");
    expect(warned).toEqual([{ level: "error", message: "two directory entries hold one email", fields: { workspace: "T1" } }]);
    expect(JSON.stringify(t.logs), "no email in any log line").not.toMatch(/example\.com/);
  });

  test("a directory entry of someone who isn't a member is not a member's, and Slack isn't asked", async () => {
    const t = backend();
    await websiteOpen(t);
    await juno(t, { kind: "not-a-member" });

    expect(await asked(t, whoAmI.name, as("juno.whitlock@example.com"))).toEqual({ kind: "not-a-member" });
    expect(lookups(t)).toEqual([]);
  });

  test("Slack failing to answer fails the request, and the handler never runs", async () => {
    const t = backend();
    await websiteOpen(t);
    t.slack.answering("users.lookupByEmail", slackError("internal_error"));

    const answer = await t.app.request(`/api/query/${whoAmI.name}`, { method: "POST", headers: { "content-type": "application/json", [apiHeader]: "1", ...as("stranger@example.com") }, body: "{}" });

    expect(answer.status).toBe(500);
    expect(t.logs.filter(({ message }) => message === "request failed")).toEqual([{ level: "error", message: "request failed", fields: { path: `/api/query/${whoAmI.name}`, error: "ReportableError" } }]);
  });

  waitsOn(["S3"], "an email only Slack knows is a person the directory is still verifying", async () => {
    const t = backend();
    await websiteOpen(t);
    t.slack.withMember("U_NEW", { profile: { email: "new.joiner@example.com" } });

    expect(await asked(t, whoAmI.name, as("new.joiner@example.com"))).toEqual({ kind: "verifying" });
  });
});

describe("the website flag", () => {
  test("closed to the workspace, every denial reads closed, and a member is closed out too", async () => {
    const t = backend();
    await websiteOpen(t, false);
    await juno(t);

    expect(await asked(t, whoAmI.name)).toEqual({ kind: "closed" });
    expect(await asked(t, whoAmI.name, as("stranger@example.com"))).toEqual({ kind: "closed" });
    expect(await asked(t, whoAmI.name, as("juno.whitlock@example.com"))).toEqual({ kind: "closed" });
  });

  test("a command when the website is closed to the member answers closed and runs nothing", async () => {
    const t = backend();
    await websiteOpen(t, false);
    await juno(t);

    expect(await asked(t, touch.name, as("juno.whitlock@example.com"))).toEqual({ kind: "closed" });
  });

  test("a command from someone signed out answers signed-out", async () => {
    const t = backend();
    await websiteOpen(t);

    expect(await asked(t, touch.name)).toEqual({ kind: "signed-out" });
  });

  waitsOn(["S6"], "a command from a member the website is open to runs, as that member", async () => {
    const t = backend();
    await websiteOpen(t);
    await juno(t, { admin: true });

    expect(await asked(t, touch.name, as("juno.whitlock@example.com"))).toEqual({ touchedBy: "U_JUNO", admin: true });
  });
});

describe("the edge's identity headers", () => {
  test("reach no path but the API's reads and commands, in either spelling", async () => {
    const t = backend();
    const headers = { "x-auth-request-email": "juno.whitlock@example.com", "x-auth-request-user": "juno", x_auth_request_email: "juno.whitlock@example.com" };

    const answer = await t.app.request("/probe/page", { headers });

    expect(await answer.json()).toEqual({});
  });
});
