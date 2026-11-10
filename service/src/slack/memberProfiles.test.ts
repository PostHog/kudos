// Ports today's convex/slack/memberProfiles.test.ts onto the service's test backend: Slack's member events and
// users.info keep a member's profile and picture in the directory, only a member holds one, and no Slack answer that can
// hold a profile is logged. A member event reaches S5's App Home republish and, for a person the directory doesn't
// know, S11's group reconcile; a kudos that mentions someone new reaches S4's engine. Those cases wait on them. The F3 backfill (`fillMemberProfiles`) is a one-off the module map leaves out, so its cases run
// against `fillProfiles`, the directory's write the backfill made, with the page it would have given.
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { memberEvent } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { notPorted } from "../notPorted.ts";
import { serviceRegistry } from "../registry.ts";
import { fillProfiles } from "../workspace/directory.ts";
import type { EventKind } from "./frontDoor.ts";
import { verifyMember } from "./verifyMember.ts";
import type { MemberProfile } from "../workspace/memberProfile.ts";

const now = new Date("2026-10-13T10:00:00Z").getTime();
const nowTs = `${now / 1000}`;
const earlierTs = `${now / 1000 - 60}`;
const laterTs = `${now / 1000 + 60}`;

const annsProfile = { email: "ann@example.com", real_name: "Ann Example", display_name: "annie", title: "Gardener" };
const annStored = { email: "ann@example.com", realName: "Ann Example", displayName: "annie", title: "Gardener" };

const backend = useTestBackend({ now });
let logged: MockInstance[];

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  logged = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("F1 F2: team_join and user_change keep a member's Slack profile in the directory", () => {
  waitsOn(["S5", "S11"], "a member who joins is kept with their email, real name, display name and title", async () => {
    const t = backend();

    await memberChanged(t, "team_join", { id: "U_ANN", profile: annsProfile });

    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
  });

  waitsOn(["S5", "S11"], "a newer user_change replaces a changed field and removes one Slack no longer gives", async () => {
    const t = backend();
    await memberChanged(t, "team_join", { id: "U_ANN", profile: annsProfile }, { eventTs: earlierTs });

    await memberChanged(t, "user_change", { id: "U_ANN", profile: { real_name: "Ann Example", email: "ann.example@example.com" } }, { eventTs: nowTs });

    expect(await profileOf(t, "U_ANN")).toEqual({ email: "ann.example@example.com", realName: "Ann Example" });
  });

  waitsOn(["S5", "S11"], "a user_change older than the one the directory holds changes nothing", async () => {
    const t = backend();
    await memberChanged(t, "user_change", { id: "U_ANN", profile: annsProfile }, { eventTs: nowTs });

    await memberChanged(t, "user_change", { id: "U_ANN", profile: { email: "old.ann@example.com" } }, { eventTs: earlierTs });

    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
  });

  waitsOn(["S5", "S11"], "a newer user_change that changes nothing the directory keeps, like a status, leaves the member's row as it was", async () => {
    const t = backend();
    await memberChanged(t, "team_join", { id: "U_ANN", tz: "Europe/Berlin", profile: annsProfile }, { eventTs: earlierTs });
    const before = await directoryRowOf(t, "U_ANN");

    await memberChanged(t, "user_change", { id: "U_ANN", tz: "Europe/Berlin", profile: { ...annsProfile, status_text: "In a meeting", status_emoji: ":calendar:" } }, { eventTs: nowTs });

    expect(await directoryRowOf(t, "U_ANN")).toEqual(before);
  });

  waitsOn(["S5", "S11"], "a display name Slack leaves empty is not kept", async () => {
    const t = backend();

    await memberChanged(t, "team_join", { id: "U_ANN", profile: { ...annsProfile, display_name: "", title: "" } });

    expect(await profileOf(t, "U_ANN")).toEqual({ email: "ann@example.com", realName: "Ann Example" });
  });
});

describe("F1 F2: users.info keeps a member's Slack profile in the directory", () => {
  waitsOn(["S4", "S11"], "a person the directory doesn't know is kept with the profile users.info gives", async () => {
    const t = backend();
    t.slack.withMember("U_ALICE").withMember("U_ANN", { profile: annsProfile });

    await kudosFromAlice(t, "U_ANN");

    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
  });

  waitsOn(["S5", "S11"], "opening App Home refreshes the member's profile through users.info", async () => {
    const t = backend();
    await memberChanged(t, "team_join", { id: "U_ANN", profile: { email: "old.ann@example.com" } }, { eventTs: earlierTs });
    t.slack.withMember("U_ANN", { profile: annsProfile });

    await received(t, await t.event({ type: "app_home_opened", user: "U_ANN", tab: "home" }), "homeOpened");
    await t.settle();

    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
  });
});

describe("F1 F5: only a member holds a profile", () => {
  for (const [who, user] of [
    ["a bot", { id: "B_HELPER", is_bot: true, profile: annsProfile }],
    ["a person from another workspace", { id: "U_GUEST", team_id: "T_OTHER", profile: annsProfile }],
  ] as const) {
    waitsOn(["S5", "S11"], `${who} is kept without one`, async () => {
      const t = backend();

      await memberChanged(t, "team_join", user);

      expect(await profileOf(t, user.id)).toEqual({});
    });
  }

  waitsOn(["S5", "S11"], "a member who leaves keeps no profile, and one who rejoins gets it back from Slack", async () => {
    const t = backend();
    await memberChanged(t, "team_join", { id: "U_ANN", profile: annsProfile }, { eventTs: earlierTs });

    await memberChanged(t, "user_change", { id: "U_ANN", deleted: true, profile: annsProfile }, { eventTs: nowTs });
    const whileGone = await profileOf(t, "U_ANN");
    await memberChanged(t, "user_change", { id: "U_ANN", profile: annsProfile }, { eventTs: laterTs });

    expect(whileGone).toEqual({});
    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
  });
});

describe("F3: the backfill's write fills every known member's profile from a users.list page", () => {
  test("it fills a missing profile, replaces a changed one and never adds a person the directory doesn't know", async () => {
    const t = backend();
    await aMember(t, "U_ANN", { asOf: earlier() });
    await aMember(t, "U_BOB", { asOf: earlier(), email: "bob@example.com", title: "Intern" });

    await backfill(t, now, { U_ANN: annStored, U_BOB: { email: "bob.example@example.com", title: "Engineer" }, U_CAROL: { email: "carol@example.com" } });

    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
    expect(await profileOf(t, "U_BOB")).toEqual({ email: "bob.example@example.com", title: "Engineer" });
    expect(await directoryRowOf(t, "U_CAROL")).toBeUndefined();
  });

  waitsOn(["S5"], "a member event older than the backfill's page leaves the backfilled profile, and still applies its other fields", async () => {
    const t = backend();
    await aMember(t, "U_ANN", { asOf: now - 120_000, email: "old.ann@example.com" });
    await backfill(t, now, { U_ANN: annStored });

    await memberChanged(t, "user_change", { id: "U_ANN", tz: "Europe/Berlin", profile: { email: "old.ann@example.com" } }, { eventTs: earlierTs });

    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
    expect((await directoryRowOf(t, "U_ANN"))?.timeZone).toBe("Europe/Berlin");
  });

  waitsOn(["S5"], "a member event newer than the backfill's page replaces the backfilled profile", async () => {
    const t = backend();
    await aMember(t, "U_ANN", { asOf: earlier() });
    await backfill(t, now, { U_ANN: annStored });

    await memberChanged(t, "user_change", { id: "U_ANN", profile: { email: "ann.example@example.com" } }, { eventTs: laterTs });

    expect(await profileOf(t, "U_ANN")).toEqual({ email: "ann.example@example.com" });
  });

  test("a backfill whose page Slack answered before another backfill's changes nothing that one wrote", async () => {
    const t = backend();
    await aMember(t, "U_ANN", { asOf: earlier() });

    await backfill(t, now + 60_000, { U_ANN: annStored });
    await backfill(t, now, { U_ANN: { email: "old.ann@example.com" } });

    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
  });

  test("a second run changes nothing", async () => {
    const t = backend();
    await aMember(t, "U_ANN", { asOf: earlier() });
    await backfill(t, now, { U_ANN: annStored });
    const afterFirstRun = await directoryRowOf(t, "U_ANN");

    await backfill(t, now + 60_000, { U_ANN: annStored });

    expect(await directoryRowOf(t, "U_ANN")).toEqual(afterFirstRun);
  });

  test("a member Slack now lists without a profile field keeps what the directory holds", async () => {
    const t = backend();
    await aMember(t, "U_ANN", { asOf: earlier(), ...annStored });

    await backfill(t, now, { U_ANN: { realName: "Ann Example" } });

    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
  });
});

describe("the directory keeps each member's Slack picture for the website", () => {
  const largePicture = "https://avatars.example.com/ann-192.png";
  const smallPicture = "https://avatars.example.com/ann-72.png";

  waitsOn(["S5", "S11"], "a member who joins is kept with the 192-pixel picture Slack gives", async () => {
    const t = backend();

    await memberChanged(t, "team_join", { id: "U_ANN", profile: { image_72: smallPicture, image_192: largePicture } });

    expect(await pictureOf(t, "U_ANN")).toBe(largePicture);
  });

  waitsOn(["S5", "S11"], "the 72-pixel picture stands in when Slack gives no 192-pixel one", async () => {
    const t = backend();

    await memberChanged(t, "team_join", { id: "U_ANN", profile: { image_72: smallPicture, image_192: "" } });

    expect(await pictureOf(t, "U_ANN")).toBe(smallPicture);
  });

  waitsOn(["S5", "S11"], "a newer user_change replaces the picture, and one without a picture removes it", async () => {
    const t = backend();
    await memberChanged(t, "team_join", { id: "U_ANN", profile: { image_192: smallPicture } }, { eventTs: earlierTs });
    await memberChanged(t, "user_change", { id: "U_ANN", profile: { image_192: largePicture } }, { eventTs: nowTs });
    const changed = await pictureOf(t, "U_ANN");

    await memberChanged(t, "user_change", { id: "U_ANN", profile: {} }, { eventTs: laterTs });

    expect(changed).toBe(largePicture);
    expect(await pictureOf(t, "U_ANN")).toBeUndefined();
  });

  waitsOn(["S5", "S11"], "a picture that isn't an https address is not kept", async () => {
    const t = backend();

    await memberChanged(t, "team_join", { id: "U_ANN", profile: { image_192: "javascript:alert(1)", image_72: "http://avatars.example.com/ann-72.png" } });

    expect(await pictureOf(t, "U_ANN")).toBeUndefined();
  });

  waitsOn(["S5", "S11"], "an https address without a host gives way to the 72-pixel picture", async () => {
    const t = backend();

    await memberChanged(t, "team_join", { id: "U_ANN", profile: { image_192: "https://", image_72: smallPicture } });

    expect(await pictureOf(t, "U_ANN")).toBe(smallPicture);
  });

  waitsOn(["S4", "S11"], "users.info keeps the picture of a person the directory doesn't know", async () => {
    const t = backend();
    t.slack.withMember("U_ALICE").withMember("U_ANN", { profile: { image_192: largePicture } });

    await kudosFromAlice(t, "U_ANN");

    expect(await pictureOf(t, "U_ANN")).toBe(largePicture);
  });

  test("the backfill's write fills the picture of every known member from a users.list page", async () => {
    const t = backend();
    await aMember(t, "U_ANN", { asOf: earlier(), ...annStored });

    await backfill(t, now, { U_ANN: { ...annStored, picture: largePicture } });

    expect(await pictureOf(t, "U_ANN")).toBe(largePicture);
    expect(await profileOf(t, "U_ANN")).toEqual(annStored);
  });
});

describe("F6: a Slack answer that can hold a profile is never logged", () => {
  waitsOn(["S4"], "a malformed users.info answer logs only a fixed code, without the profile or the user ID", async () => {
    const t = backend();
    t.slack.withMember("U_ALICE").answering("users.info", formEncodedAnswer, formEncodedAnswer);

    await kudosFromAlice(t, "U_DAVE");

    expect(everythingLogged(t)).not.toMatch(/dave|U_ALICE/i);
    expect(everythingLogged(t)).toContain("slack.users_info_failed");
  });

  waitsOn(["S4", "S11"], "a users.info answer with a field of the wrong type keeps the member and logs nothing of the answer", async () => {
    const t = backend();
    t.slack.withMember("U_ALICE").withMember("U_DAVE", { tz: 123, profile: { email: "dave@example.com", real_name: "Dave Example", title: 7 } } as never);

    await kudosFromAlice(t, "U_DAVE");

    expect(await profileOf(t, "U_DAVE")).toEqual({ email: "dave@example.com", realName: "Dave Example" });
    expect(everythingLogged(t)).not.toMatch(/dave/i);
  });

  waitsOn(["S4", "S11"], "a users.info answer naming a user ID of the wrong type keeps the person asked about", async () => {
    const t = backend();
    t.slack.withMember("U_ALICE").withMember("U_DAVE", { profile: { email: "dave@example.com" } });
    t.slack.answering("users.info", () => Response.json({ ok: true, user: { id: 42, team_id: "T1", profile: { email: "alice@example.com" } } }));

    await kudosFromAlice(t, "U_DAVE");

    expect(await profileOf(t, "U_ALICE")).toEqual({ email: "alice@example.com" });
    expect(everythingLogged(t)).not.toMatch(/alice@|dave@/i);
  });

  test("a signed member event naming a user ID of the wrong type is acknowledged and logs nothing of it", async () => {
    const t = backend();

    const response = await t.send("/events", memberEvent("user_change", { id: 42, profile: { email: "dave@example.com", title: "Baker" } }));

    expect(response.status).toBe(200);
    expect(await t.seed.all("members")).toEqual([]);
    expect(everythingLogged(t)).not.toMatch(/dave|baker/i);
  });

  test("a users.info refusal carrying a retry delay that isn't a number fails verification without quoting it", async () => {
    const t = backend();
    t.slack.answering("users.info", () => Response.json({ ok: false, error: "user_not_found", retryAfterMs: "dave@example.com" }));

    const failure = await t.operations.action("slack.verifyMember.verifyMember", (ctx) => verifyMember(ctx, { workspace: "T1", user: "U_DAVE" })).then(
      () => null,
      (error: unknown) => String(error),
    );

    expect(t.slack.callsTo("users.info")).toEqual([{ user: "U_DAVE" }]);
    expect(failure ?? "").not.toMatch(/dave@/i);
    expect(everythingLogged(t)).not.toMatch(/dave@/i);
  });

  test("a signed member event whose event ID isn't a string is acknowledged and logs nothing of it", async () => {
    const t = backend();
    const body = JSON.stringify({ type: "event_callback", team_id: "T1", event_id: ["dave@example.com"], event: { type: "user_change", user: { id: "U_DAVE", team_id: "T1" }, event_ts: nowTs } });

    const response = await t.send("/events", body);

    expect(response.status).toBe(200);
    expect(everythingLogged(t)).not.toMatch(/dave@/i);
  });

  test("a signed member event that isn't JSON is refused without quoting it", async () => {
    const t = backend();

    const response = await t.send("/events", "email=dave%40example.com&type=event_callback&team_id=T1");

    expect(response.status).toBe(500);
    expect(everythingLogged(t)).toContain("SyntaxError");
    expect(everythingLogged(t)).not.toMatch(/dave/i);
  });
});

// A signed member event through the front door. A handler that reaches a stub answers 500 and the front door logs only
// the error's class, so a stub reached here is thrown again for `waitsOn`, as the backend's `settle` throws a job's.
// An event no domain handles yet is acknowledged and dropped, which is thrown as the stub of the handler it waits for.
async function memberChanged(t: TestBackend, ...event: Parameters<typeof memberEvent>) {
  return received(t, await t.send("/events", memberEvent(...event)), "memberChanged");
}

async function received(t: TestBackend, response: Response, kind: EventKind) {
  if (serviceRegistry.slack.events?.[kind] === undefined) throw notPorted(`the Slack ${kind} event's handler`);
  const failed = t.logs.findLast(({ level, message }) => level === "error" && message === "slack request failed");
  if (response.status === 500 && failed?.fields.error === "NotPortedError") throw notPorted(`a body the Slack ${kind} event's handler reaches (the front door logs no path)`);
  return response;
}

// A kudos from U_ALICE mentioning `user`, whom the directory doesn't know yet: the engine checks the directory.
async function kudosFromAlice(t: TestBackend, user: string) {
  await received(t, await t.event({ type: "message", channel: "C1", user: "U_ALICE", ts: `${now / 1000}.000100`, text: `<@${user}> :taco:` }), "message");
  await t.settle();
}

function earlier() {
  return now - 60_000;
}

async function aMember(t: TestBackend, user: string, fields: { asOf: number } & MemberProfile) {
  await t.seed.insert("members", { workspace: "T1", user, kind: "member", ...fields });
}

// What the backfill wrote for one users.list page Slack answered at `asOf`.
async function backfill(t: TestBackend, asOf: number, profiles: Record<string, MemberProfile>) {
  await t.run((ctx) => fillProfiles(ctx, { profiles: Object.entries(profiles).map(([user, profile]) => ({ workspace: "T1", user, profile, asOf })) }));
}

function formEncodedAnswer() {
  return new Response("email=dave%40example.com&real_name=Dave+Example&ok=true", { headers: { "content-type": "application/json" } });
}

function everythingLogged(t: TestBackend) {
  const consoleLines = logged.flatMap((spy) => spy.mock.calls).map((call) => call.map((argument) => (typeof argument === "string" ? argument : (JSON.stringify(argument) ?? String(argument)))).join(" "));
  const serviceLines = t.logs.map(({ message, fields }) => `${message} ${JSON.stringify(fields)}`);
  return [...consoleLines, ...serviceLines].join("\n");
}

async function directoryRowOf(t: TestBackend, user: string) {
  return (await t.seed.all("members")).find((row) => row.workspace === "T1" && row.user === user);
}

async function profileOf(t: TestBackend, user: string) {
  const row = await directoryRowOf(t, user);
  const { email, realName, displayName, title } = row ?? {};
  return Object.fromEntries(Object.entries({ email, realName, displayName, title }).filter(([, value]) => value !== undefined));
}

async function pictureOf(t: TestBackend, user: string) {
  return (await directoryRowOf(t, user))?.picture;
}
