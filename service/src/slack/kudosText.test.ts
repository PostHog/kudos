// A kudos message's words, from outside: kept as Slack sends them through the front door, replaced by the newest
// revision, forgotten when the message is edited away or deleted, when its author leaves or a maintainer asks, filled
// in later by the backfill, and never quoted by a failure. Today's convex/slack/kudosText.test.ts.
//
// Every message goes through the parser's hooks (S7's owned store emoji, S9's earned album emoji) and every observed
// one through the directory's recheck (S3); a message that gives is told (S5) and placed in the spotlight (S11). A
// member who leaves reaches the directory's member events (S3), a maintainer's request S3's word deletion, the backfill
// S4's own later slice, and a captured exception S14's error boundary. Postgres has no transaction limits, so the
// tests that ran within Convex's limits keep only their outcome.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { deleteMessage, deleteThreadParent, edit, everythingStored, kudosReceived, memberChanged, post, sendEvent, settle } from "../../testing/messageFlows.ts";
import { broadcast, channel, channelMessage, codeBlock, emoji, link, list, mention, messageEvent, quote, section, text, tonedEmoji, unicodeEmoji, userGroup, type MessageOptions, type RichElement } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { ReportableError } from "../analytics/exceptions.ts";
import { decodeStored } from "../db/codec.ts";
import { jobs } from "../db/schema/index.ts";
import { forgetPageSize, forgetWordsOfLeaver, wordsOf } from "../engine/kudosText.ts";
import type { WordSegment } from "../engine/messageEvent.ts";
import { NotPortedError, notPorted } from "../notPorted.ts";
import type { MemberId } from "../workspace/directory.ts";
import { backfillWordsJob } from "./backfill.ts";
import { recheckMessage } from "./directory.ts";

const forced = vi.hoisted(() => ({ failure: false, adapterFailure: false, purgeFailure: false, hydrateFailure: false, beforeCapture: false, wordsReadFailure: false }));

vi.mock("./richText.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./richText.ts")>();
  return {
    ...original,
    segmentsOf: (...args: Parameters<typeof original.segmentsOf>) => {
      const segments = original.segmentsOf(...args);
      if (forced.adapterFailure) throw new ReportableError(`could not read ${textOf(segments)}`);
      return segments;
    },
  };
});

vi.mock("../workspace/directory.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../workspace/directory.ts")>();
  return {
    ...original,
    chatUserOf: async (...args: Parameters<typeof original.chatUserOf>) => {
      if (forced.purgeFailure) throw new ReportableError(`could not forget ${reason}`);
      return original.chatUserOf(...args);
    },
  };
});

vi.mock("../engine/kudosText.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../engine/kudosText.ts")>();
  return {
    ...original,
    keepWords: async (...args: Parameters<typeof original.keepWords>) => {
      if (forced.failure) throw new ReportableError(`could not keep ${textOf(args[1].words?.segments ?? [])}`);
      if (forced.beforeCapture) return;
      return original.keepWords(...args);
    },
    wordsOf: async (...args: Parameters<typeof original.wordsOf>) => {
      const words = await original.wordsOf(...args);
      if (forced.wordsReadFailure && words.kind === "text") throw new ReportableError(`could not read ${textOf(words.segments)}`);
      return words;
    },
    keepFetchedWords: async (...args: Parameters<typeof original.keepFetchedWords>) => {
      if (forced.hydrateFailure) throw new ReportableError(`could not hydrate ${textOf(args[1].segments)}`);
      return original.keepFetchedWords(...args);
    },
  };
});

const now = new Date("2026-10-13T10:00:00Z");
const postedTs = "1760349600.000100";
const message = { workspace: "T1", conversation: "C1", message: postedTs };
const reason = "for the calm rollback of the billing service";
const thanksBob = [section(text(`thanks ${reason} `), mention("U_BOB"), text(" "), emoji("taco"))];
const backend = useTestBackend({ now: now.getTime() });

// What a message reaches before it is read, and before it is told and placed in the spotlight.
const read: [Stack, ...Stack[]] = ["S3", "S7", "S9"];
const given: [Stack, ...Stack[]] = ["S3", "S5", "S7", "S9", "S11"];
const backfilled: [Stack, ...Stack[]] = ["S3", "S4", "S5", "S7", "S9", "S11"];

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
});

afterEach(() => {
  forced.failure = false;
  forced.adapterFailure = false;
  forced.hydrateFailure = false;
  forced.beforeCapture = false;
  forced.purgeFailure = false;
  forced.wordsReadFailure = false;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function withSlack() {
  const t = backend();
  t.slack.withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL");
  return t;
}

describe("AT2 AT3: a kudos message's words", () => {
  waitsOn(given, "are kept as segments in order, every element counted or not, with the channel's visibility, the author and the gate decision", async () => {
    const t = withSlack();

    await post(t, [
      section(
        text("Thanks "),
        mention("U_BOB"),
        text(" and "),
        userGroup("S1"),
        text(" for the "),
        text("rollback", { bold: true, italic: true }),
        text(" fix "),
        emoji("taco"),
        text(" "),
        unicodeEmoji("pray", "1f64f"),
      ),
      section(text("see "), link("https://example.com/runbook", "the runbook"), text(" in "), channel("C2"), text(" "), broadcast("here"), text("\nold: "), text("v1", { strike: true })),
      quote(text("quoted "), emoji("taco")),
      codeBlock(text("make deploy")),
      list(section(text("first")), section(text("second"))),
    ]);
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(await words(t)).toEqual({
      kind: "text",
      segments: [
        { kind: "text", text: "Thanks " },
        { kind: "person", user: "U_BOB" },
        { kind: "text", text: " and " },
        { kind: "group", group: "S1" },
        { kind: "text", text: " for the " },
        { kind: "text", text: "rollback", bold: true, italic: true },
        { kind: "text", text: " fix " },
        { kind: "emoji", name: "taco" },
        { kind: "text", text: " " },
        { kind: "emoji", name: "pray", unicode: "🙏" },
        { kind: "break" },
        { kind: "text", text: "see " },
        { kind: "link", url: "https://example.com/runbook", label: "the runbook" },
        { kind: "text", text: " in " },
        { kind: "channel" },
        { kind: "text", text: " " },
        { kind: "broadcast", range: "here" },
        { kind: "break" },
        { kind: "text", text: "old: " },
        { kind: "text", text: "v1", strike: true },
        { kind: "break" },
        { kind: "text", text: "quoted " },
        { kind: "emoji", name: "taco" },
        { kind: "break" },
        { kind: "text", text: "make deploy", code: true },
        { kind: "break" },
        { kind: "text", text: "first" },
        { kind: "break" },
        { kind: "text", text: "second" },
      ],
      edited: false,
      visibility: "public",
      author: "U_ALICE",
      gate: { version: 1, thoughtful: true },
    });
  });

  waitsOn(given, "keep the skin tone Slack sends beside an emoji's name in the name, as Slack writes a toned emoji, and drop a character without it", async () => {
    const t = withSlack();

    await post(t, [
      section(
        text(`thanks ${reason} `),
        mention("U_BOB"),
        text(" "),
        emoji("taco"),
        tonedEmoji("+1", 3, "1f44d-1f3fc"),
        tonedEmoji("ok_hand", 5, "1f44c"),
        tonedEmoji("wave", 6),
        tonedEmoji("wave::skin-tone-2", 2),
        tonedEmoji("clap", 1),
        tonedEmoji("pray", 7),
        { type: "emoji", name: "muscle", skin_tone: "4" } as never,
      ),
    ]);
    await settle(t);

    const kept = await words(t);
    if (kept.kind !== "text") throw new Error(`expected the words, got ${kept.reason}`);
    expect(kept.segments.filter((segment) => segment.kind === "emoji")).toEqual([
      { kind: "emoji", name: "taco" },
      { kind: "emoji", name: "+1::skin-tone-3", unicode: "👍🏼" },
      { kind: "emoji", name: "ok_hand::skin-tone-5" },
      { kind: "emoji", name: "wave::skin-tone-6" },
      { kind: "emoji", name: "wave::skin-tone-2" },
      { kind: "emoji", name: "clap" },
      { kind: "emoji", name: "pray" },
      { kind: "emoji", name: "muscle" },
    ]);
  });

  waitsOn(given, "of a private channel are private, and a message that says why carries that gate decision", async () => {
    const t = withSlack();

    await post(t, thanksBob, { channelType: "group", channel: "G2" });
    await settle(t);

    expect(await words(t, { conversation: "G2" })).toMatchObject({ kind: "text", visibility: "private", gate: { version: 1, thoughtful: true } });
  });

  waitsOn(given, "of a message that doesn't give are kept while it is a kudos message", async () => {
    const t = withSlack();

    await post(t, [section(text("thanks "), mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))]);
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(await words(t)).toMatchObject({ kind: "text", segments: expect.arrayContaining([{ kind: "text", text: "thanks " }]) });
  });

  test("of a message nobody has seen are not captured", async () => {
    const t = withSlack();

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "not-captured" });
  });
});

describe("AT2 AT39: a kudos message too long to keep whole", () => {
  waitsOn(given, "still gives, and keeps at most its first 2,000 segments", async () => {
    const t = withSlack();
    const lines = Array.from({ length: 5_000 }, (_, index) => `line ${index}`).join("\n");

    await post(t, [section(mention("U_BOB"), text(" thanks for all of this "), emoji("taco"), text(`\n${lines}`))]);
    await settle(t);

    const kept = await words(t);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    if (kept.kind !== "text") throw new Error(`expected the words, got ${kept.reason}`);
    expect(kept.segments.length).toBeGreaterThan(1_990);
    expect(kept.segments.length).toBeLessThanOrEqual(2_000);
    expect(kept.segments.slice(0, 5)).toEqual([{ kind: "person", user: "U_BOB" }, { kind: "text", text: " thanks for all of this " }, { kind: "emoji", name: "taco" }, { kind: "break" }, { kind: "text", text: "line 0" }]);
  });
});

describe("AT4: the newest revision wins", () => {
  waitsOn(given, "an edit replaces the words, marks them edited and takes its own gate decision", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);

    await edit(t, [section(text("cheers "), mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    expect(await words(t)).toMatchObject({
      kind: "text",
      segments: [{ kind: "text", text: "cheers " }, { kind: "person", user: "U_BOB" }, { kind: "emoji", name: "taco" }],
      edited: true,
      gate: { version: 1, thoughtful: false },
    });
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  waitsOn(given, "an older revision arriving late changes nothing", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await edit(t, [section(text("newest "), mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    await edit(t, [section(text("older "), mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    expect(await words(t)).toMatchObject({ kind: "text", segments: [{ kind: "text", text: "newest " }, expect.anything(), expect.anything()] });
  });

  waitsOn(given, "an edit that arrives before its post keeps the edit's words", async () => {
    const t = withSlack();

    await edit(t, [section(text("edited first "), mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);

    expect(await words(t)).toMatchObject({ kind: "text", segments: [{ kind: "text", text: "edited first " }, expect.anything(), expect.anything()], edited: true });
  });
});

describe("AT5: edited away", () => {
  waitsOn(given, "removing the kudos emoji deletes the words and leaves them deleted, and the kudos stays", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);

    await edit(t, [section(text(`thanks ${reason} `), mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "deleted" });
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  waitsOn(given, "a newer revision by an author who is no longer a member leaves no words, whatever it says", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);
    await memberChanged(t, "user_change", { id: "U_ALICE", deleted: true });
    await settle(t);

    await edit(t, [section(text("no emoji any more "), mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await storedAndScheduled(t)).not.toContain(reason);
  });

  waitsOn(given, "editing it back into a kudos message keeps the newest words again", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await edit(t, [section(text("no emoji "), mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    await edit(t, [section(text("back again "), mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(await words(t)).toMatchObject({ kind: "text", segments: [{ kind: "text", text: "back again " }, expect.anything(), expect.anything()] });
  });
});

describe("AT6: deleted in Slack", () => {
  waitsOn(given, "a message_deleted without a channel type deletes the words, and the kudos, the indicator and Slack stay untouched", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);
    const callsBefore = t.slack.calls.length;

    const response = await deleteMessage(t, { ts: postedTs, previous: thanksBob });
    await settle(t);

    expect(response.status).toBe(200);
    expect(await words(t)).toEqual({ kind: "unavailable", reason: "deleted" });
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.calls.slice(callsBefore)).toEqual([]);
  });

  waitsOn(given, "a late or redelivered edit of a deleted message stores nothing", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);
    await deleteMessage(t, { ts: postedTs, previous: thanksBob });

    await edit(t, [section(text("too late "), mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "deleted" });
    expect(stringify(await everythingStored(t))).not.toContain("too late");
  });

  waitsOn(given, "a deletion that arrives before its post wins, and the kudos still gives", async () => {
    const t = withSlack();

    await deleteMessage(t, { ts: postedTs, previous: thanksBob });
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "deleted" });
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(stringify(await everythingStored(t))).not.toContain(reason);
  });

  waitsOn(given, "a deleted thread parent, a message_changed whose message is a tombstone, deletes the words", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);

    await deleteThreadParent(t, { ts: postedTs, previous: thanksBob });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "deleted" });
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  waitsOn(["S3"], "an ordinary message's deletion stores nothing", async () => {
    const t = withSlack();
    await post(t, [section(text("lunch at noon?"))], { ts: postedTs });
    await settle(t);

    await deleteMessage(t, { ts: postedTs, previous: [section(text("lunch at noon?"))] });
    await settle(t);

    expect(await everythingStored(t)).toEqual([]);
  });
});

describe("AT7: a member who leaves", () => {
  const secondTs = "1760349660.000100";
  const thanksAlice = [section(text("thanks for pairing on the migration "), mention("U_ALICE"), text(" "), emoji("taco"))];

  waitsOn(given, "has every word they wrote removed at once, and only the words that mention them stay", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await post(t, thanksBob, { ts: secondTs, channel: "C2" });
    await post(t, thanksAlice, { ts: postedTs, user: "U_CAROL", channel: "C3" });
    await settle(t);

    await memberChanged(t, "user_change", { id: "U_ALICE", deleted: true });

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await words(t, { conversation: "C2", message: secondTs })).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await words(t, { conversation: "C3" })).toMatchObject({ kind: "text", author: "U_CAROL" });
  });

  waitsOn(given, "are purged, a later edit can't refill them, and the kudos stay", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await post(t, thanksBob, { ts: secondTs, channel: "C2" });
    await settle(t);

    await memberChanged(t, "user_change", { id: "U_ALICE", deleted: true });
    await settle(t);
    await memberChanged(t, "user_change", { id: "U_ALICE", deleted: false }, { eventTs: aMinuteLater(t) });
    await edit(t, [section(text("cheers again "), mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await words(t, { conversation: "C2", message: secondTs })).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await storedAndScheduled(t)).not.toContain(reason);
    expect(await storedAndScheduled(t)).not.toContain("cheers again");
    expect(await kudosReceived(t, "U_BOB")).toBe(2);
  });

  waitsOn(given, "whose edit arrives before the purge leaves a removed tombstone that a later edit can't refill", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);

    await memberChanged(t, "user_change", { id: "U_ALICE", deleted: true });
    await edit(t, [section(text("edited while gone "), mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);
    await memberChanged(t, "user_change", { id: "U_ALICE", deleted: false }, { eventTs: aMinuteLater(t) });
    await edit(t, [section(text("cheers again "), mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await storedAndScheduled(t)).not.toContain("cheers again");
  });

  waitsOn(given, "who comes back has their new kudos stored again", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await settle(t);
    await memberChanged(t, "user_change", { id: "U_ALICE", deleted: true });
    await settle(t);

    await memberChanged(t, "user_change", { id: "U_ALICE", deleted: false }, { eventTs: aMinuteLater(t) });
    await post(t, [section(text("welcome back thanks "), mention("U_BOB"), emoji("taco"))], { ts: secondTs, channel: "C2" });
    await settle(t);

    expect(await words(t, { conversation: "C2", message: secondTs })).toMatchObject({ kind: "text", segments: [{ kind: "text", text: "welcome back thanks " }, expect.anything(), expect.anything()] });
    expect(await words(t)).toEqual({ kind: "unavailable", reason: "removed" });
  });

  waitsOn(backfilled, "whose purge bars the backfill from their earlier kudos after they come back, while another member's are filled and their new kudos stored live", async () => {
    const t = withSlack();
    await givenBeforeCapture(t, thanksBob, { ts: postedTs });
    await givenBeforeCapture(t, thanksBob, { ts: postedTs, user: "U_CAROL", channel: "C2" });

    await leaveAndComeBack(t);
    await post(t, [section(text("welcome back thanks "), mention("U_BOB"), emoji("taco"))], { ts: secondTs, channel: "C3" });
    await settle(t);
    await backfill(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "not-captured" });
    expect(await words(t, { conversation: "C2" })).toMatchObject({ kind: "text", author: "U_CAROL", visibility: "unknown" });
    expect(await words(t, { conversation: "C3", message: secondTs })).toMatchObject({ kind: "text", author: "U_ALICE" });
    expect(t.slack.callsTo("conversations.history")).toEqual([expect.objectContaining({ channel: "C2" })]);
  });
});

describe("AT8: on request", () => {
  waitsOn(given, "a maintainer removes every word one member authored, and keeps storing their later kudos", async () => {
    const t = withSlack();
    await post(t, thanksBob, { ts: postedTs });
    await post(t, thanksBob, { ts: postedTs, user: "U_CAROL", channel: "C2" });
    await settle(t);

    await forgetWordsOfMember(t, { workspace: "T1", user: "U_ALICE" });
    await settle(t);
    await post(t, [section(text("still thankful "), mention("U_BOB"), emoji("taco"))], { ts: "1760349660.000100", channel: "C3" });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await words(t, { conversation: "C2" })).toMatchObject({ kind: "text", author: "U_CAROL" });
    expect(await words(t, { conversation: "C3", message: "1760349660.000100" })).toMatchObject({ kind: "text", author: "U_ALICE" });
    expect(await kudosReceived(t, "U_BOB")).toBe(3);
  });

  waitsOn(given, "a maintainer removes one member's words of more messages than one page", async () => {
    const t = withSlack();
    const messages = Array.from({ length: forgetPageSize * 2 + 1 }, (_, index) => `1760349600.${String(index).padStart(6, "0")}`);
    for (const ts of messages) await post(t, thanksBob, { ts });
    await settle(t);

    await forgetWordsOfMember(t, { workspace: "T1", user: "U_ALICE" });
    await settle(t);

    for (const ts of messages) expect(await words(t, { message: ts })).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await storedAndScheduled(t)).not.toContain(reason);
  });

  waitsOn(given, "a maintainer empties a workspace of more messages than one page, and a later edit can't refill them", async () => {
    const t = withSlack();
    const messages = Array.from({ length: forgetPageSize * 2 + 1 }, (_, index) => `1760349600.${String(index).padStart(6, "0")}`);
    for (const ts of messages) await post(t, thanksBob, { ts });
    await settle(t);

    await forgetWordsOfWorkspace(t, { workspace: "T1" });
    await settle(t);
    await edit(t, [section(text("cheers again "), mention("U_BOB"), emoji("taco"))], { ts: messages[0], editedTs: "1760349720.000100" });
    await settle(t);

    for (const ts of messages) expect(await words(t, { message: ts })).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await storedAndScheduled(t)).not.toContain(reason);
    expect(await storedAndScheduled(t)).not.toContain("cheers again");
  });

  waitsOn(given, "leaves another workspace's words", async () => {
    const t = withSlack();
    t.slack.withMember("U_DAN", { team_id: "T2" }).withMember("U_ERIN", { team_id: "T2" });
    await post(t, thanksBob, { ts: postedTs });
    await post(t, [section(text(`thanks ${reason} `), mention("U_ERIN"), text(" "), emoji("taco"))], { ts: postedTs, team: "T2", user: "U_DAN" });
    await settle(t);

    await forgetWordsOfWorkspace(t, { workspace: "T1" });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "removed" });
    expect(await words(t, { workspace: "T2" })).toMatchObject({ kind: "text" });
  });

  waitsOn(backfilled, "a member's request bars the backfill from their earlier kudos, while another member's are filled and their later kudos stored live", async () => {
    const t = withSlack();
    await givenBeforeCapture(t, thanksBob, { ts: postedTs });
    await givenBeforeCapture(t, thanksBob, { ts: postedTs, user: "U_CAROL", channel: "C2" });

    await forgetWordsOfMember(t, { workspace: "T1", user: "U_ALICE" });
    await settle(t);
    await backfill(t);
    await post(t, [section(text("still thankful "), mention("U_BOB"), emoji("taco"))], { ts: "1760349660.000100", channel: "C3" });
    await settle(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "not-captured" });
    expect(await words(t, { conversation: "C2" })).toMatchObject({ kind: "text", author: "U_CAROL", visibility: "unknown" });
    expect(await words(t, { conversation: "C3", message: "1760349660.000100" })).toMatchObject({ kind: "text", author: "U_ALICE" });
    expect(t.slack.callsTo("conversations.history")).toEqual([expect.objectContaining({ channel: "C2" })]);
  });

  waitsOn(backfilled, "a workspace's request bars the backfill from every earlier kudos of it, while another workspace's are filled", async () => {
    const t = withSlack();
    t.slack.withMember("U_DAN", { team_id: "T2" }).withMember("U_ERIN", { team_id: "T2" });
    await givenBeforeCapture(t, thanksBob, { ts: postedTs });
    await givenBeforeCapture(t, thanksBob, { ts: postedTs, user: "U_CAROL", channel: "C2" });
    await givenBeforeCapture(t, [section(text(`thanks ${reason} `), mention("U_ERIN"), text(" "), emoji("taco"))], { ts: postedTs, team: "T2", user: "U_DAN", channel: "C9" });

    await forgetWordsOfWorkspace(t, { workspace: "T1" });
    await settle(t);
    await backfill(t);

    expect(await words(t)).toEqual({ kind: "unavailable", reason: "not-captured" });
    expect(await words(t, { conversation: "C2" })).toEqual({ kind: "unavailable", reason: "not-captured" });
    expect(await words(t, { workspace: "T2", conversation: "C9" })).toMatchObject({ kind: "text", author: "U_DAN" });
  });
});

describe("AT11: a malformed event never reaches the events mutation, whose argument check would quote the words", () => {
  // An event the adapter refuses is answered before any domain code. One whose malformed part the adapter drops, a
  // thread or an element of the message, is read without it: it still gives, so it reaches what a kudos message does.
  const malformed: Array<[string, Stack[], MessageOptions, RichElement[]]> = [
    ["a channel that isn't a string", [], { extra: { channel: 404 } }, thanksBob],
    ["a channel type that names an object's own property", [], { channelType: "__proto__" as "channel" }, thanksBob],
    ["a channel type that names an inherited method", [], { channelType: "toString" as "channel" }, thanksBob],
    ["a ts that isn't a string", [], { extra: { ts: 1760349600.0001 } }, thanksBob],
    ["an author that isn't a string", [], { extra: { user: 404 } }, thanksBob],
    ["a thread that isn't a string", given, { extra: { thread_ts: 1760349000 } }, thanksBob],
    ["a team that isn't a string", [], { extra: { team: 404 }, team: 404 as unknown as string }, thanksBob],
    ["a mention whose user isn't a string", given, {}, [section(text(`thanks ${reason} `), { type: "user", user_id: 404 } as never, mention("U_BOB"), emoji("taco"))]],
    ["an emoji whose name isn't a string", given, {}, [section(text(`thanks ${reason} `), mention("U_BOB"), { type: "emoji", name: 404 } as never, emoji("taco"))]],
    ["a link whose url isn't a string", given, {}, [section(text(`thanks ${reason} `), mention("U_BOB"), { type: "link", url: 404, text: 7 } as never, emoji("taco"))]],
    ["text that isn't a string", given, {}, [section({ type: "text", text: 404 } as never, mention("U_BOB"), emoji("taco"))]],
  ];
  for (const [name, stacks, options, blocks] of malformed) {
    testOrWait(stacks, `${name} is answered without failing`, async () => {
      const t = withSlack();

      const response = await sendEvent(t, messageEvent(blocks, options));
      await settle(t);

      expect(response.status).toBe(200);
    });
  }
});

describe("AT40: only kudos messages' text is stored", () => {
  waitsOn(read, "an ordinary chat message's text is in no table and no job", async () => {
    const t = withSlack();
    const ordinary = "the deploy rescue on friday";

    await post(t, [section(text(ordinary), mention("U_BOB"))]);
    await edit(t, [section(text(`${ordinary}, edited`), mention("U_BOB"))], { editedTs: "1760349660.000100" });
    await settle(t);

    expect(await storedAndScheduled(t)).not.toContain(ordinary);
    expect(await storedAndScheduled(t)).not.toContain("thanks for the help");
  });

  waitsOn(given, "a kudos message's words are only in the kudos text and in no job's arguments", async () => {
    const t = withSlack();

    await post(t, thanksBob);
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(await kudosText(t)).toContain(reason);
    expect(await storedAndScheduled(t, { besideKudosText: true })).not.toContain(reason);
    expect(await storedAndScheduled(t)).not.toContain("thanks for the help");
  });

  const forgettings: Array<[string, (t: TestBackend) => Promise<unknown>]> = [
    ["deleting it", (t) => deleteMessage(t, { ts: postedTs, previous: thanksBob })],
    ["editing it away", (t) => edit(t, [section(text(`${reason}, edited`), mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" })],
    ["its author leaving", (t) => memberChanged(t, "user_change", { id: "U_ALICE", deleted: true })],
  ];
  for (const [name, forget] of forgettings) {
    waitsOn(given, `${name} leaves its words nowhere`, async () => {
      const t = withSlack();
      await post(t, thanksBob, { ts: postedTs });
      await settle(t);

      await forget(t);
      await settle(t);

      expect(await kudosReceived(t, "U_BOB")).toBe(1);
      expect(await storedAndScheduled(t)).not.toContain(reason);
    });
  }

  const requests: Array<[string, (t: TestBackend) => Promise<unknown>]> = [
    ["its author's", (t) => forgetWordsOfMember(t, { workspace: "T1", user: "U_ALICE" })],
    ["its workspace's", (t) => forgetWordsOfWorkspace(t, { workspace: "T1" })],
  ];
  for (const [name, request] of requests) {
    waitsOn(backfilled, `${name} deletion request before the backfill leaves its words nowhere`, async () => {
      const t = withSlack();
      await givenBeforeCapture(t, thanksBob, { ts: postedTs });

      await request(t);
      await settle(t);
      await backfill(t);

      expect(await kudosReceived(t, "U_BOB")).toBe(1);
      expect(await storedAndScheduled(t)).not.toContain(reason);
    });
  }

  waitsOn(backfilled, "its author leaving and coming back before the backfill leaves its words nowhere", async () => {
    const t = withSlack();
    await givenBeforeCapture(t, thanksBob, { ts: postedTs });

    await leaveAndComeBack(t);
    await backfill(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(await storedAndScheduled(t)).not.toContain(reason);
  });

  describe("AT11: with capture on, a failure that would quote the words", () => {
    let consoleLines: unknown[][];

    beforeEach(() => {
      vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test_project_token");
      vi.stubEnv("KUDOS_ENVIRONMENT", "production");
      vi.stubEnv("POSTHOG_HOST", "https://posthog.test");
      consoleLines = [];
      for (const level of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, level).mockImplementation((...line) => void consoleLines.push(line));
    });

    // What each failure reaches before it fails: the events mutation fails after the parser's hooks, the adapter before
    // any domain code, and hydrate inside the backfill; recording its exception is S14's error boundary.
    const failures: Array<[string, Stack[], (t: TestBackend) => Promise<unknown>]> = [
      [
        "thrown in the events mutation, as a reportable error",
        given,
        async (t) => {
          forced.failure = true;
          return post(t, thanksBob);
        },
      ],
      [
        "thrown in the Slack adapter, as a reportable error",
        [],
        async (t) => {
          forced.adapterFailure = true;
          return post(t, thanksBob);
        },
      ],
      ["thrown in hydrate, as a reportable error", withStacks(given, ["S4"]), (t) => backfillFailingInHydrate(t)],
    ];

    for (const [name, reached, fail] of failures) {
      waitsOn(withStacks(["S14"], reached), `${name} leaves no words in the outbox, a captured exception, the console or the rethrown error`, async () => {
        const t = withSlack();
        const failure = await failed(t, fail);
        await settle(t);

        expect(failure).not.toBeNull();
        expect(String(failure)).not.toContain(reason);
        expect(await exceptionsRecorded(t)).toHaveLength(1);
        expect(stringify(await everythingStored(t))).not.toContain(reason);
        expect(stringify(t.postHog.requests)).not.toContain(reason);
        expect(stringify([consoleLines, t.logs])).not.toContain(reason);
      });

      testOrWait(reached, `${name}, with native error reporting on, is rethrown without the words`, async () => {
        vi.stubEnv("POSTHOG_NATIVE_ERRORS", "on");
        const t = withSlack();

        const failure = await failed(t, fail);

        expect(failure).not.toBeNull();
        expect(String(failure)).not.toContain(reason);
        expect(stringify([consoleLines, t.logs])).not.toContain(reason);
      });
    }

    waitsOn(given, "thrown in the purge of a member who leaves, as a reportable error, leaves no words in a job, the outbox, a captured exception or the console", async () => {
      const t = withSlack();
      await post(t, thanksBob);
      await settle(t);

      forced.purgeFailure = true;
      await memberChanged(t, "user_change", { id: "U_ALICE", deleted: true });
      await settle(t);

      expect(await stateOfJob(t, "engine.kudosText.forgetWordsOfLeaver")).toBe("failed");
      const member = await memberIdOf(t, "U_ALICE");
      const rerun = await t.run((ctx) => forgetWordsOfLeaver(ctx, { event: { type: "memberLeft", workspace: "T1", member, at: t.clock.now() } })).then(
        () => null,
        (error: unknown) => error,
      );
      expect(String(rerun)).toContain("message withheld");
      expect(String(rerun)).not.toContain(reason);
      expect(await storedAndScheduled(t, { besideKudosText: true })).not.toContain(reason);
      expect(stringify(t.postHog.requests)).not.toContain(reason);
      expect(stringify([consoleLines, t.logs])).not.toContain(reason);
    });

    waitsOn(given, "thrown in the directory recheck as it reads the words, as a reportable error, leaves no words in a job, the outbox, a captured exception or the console", async () => {
      const t = withSlack();
      forced.wordsReadFailure = true;
      await post(t, thanksBob);
      await settle(t);

      expect(await stateOfJob(t, "slack.directory.checkDirectory")).toBe("failed");
      const [kudosMessage] = await t.seed.all("kudosMessages");
      const rerun = await t.run((ctx) => recheckMessage(ctx, { ref: message, attempt: kudosMessage!.attempt })).then(
        () => null,
        (error: unknown) => error,
      );
      expect(String(rerun)).toContain("message withheld");
      expect(String(rerun)).not.toContain(reason);
      expect(await storedAndScheduled(t, { besideKudosText: true })).not.toContain(reason);
      expect(stringify(t.postHog.requests)).not.toContain(reason);
      expect(stringify([consoleLines, t.logs])).not.toContain(reason);
    });

    async function backfillFailingInHydrate(t: TestBackend) {
      forced.beforeCapture = true;
      await post(t, thanksBob, { ts: postedTs });
      await settle(t);
      forced.beforeCapture = false;
      t.slack.withMessage("C1", channelMessage(thanksBob, { ts: postedTs }));
      forced.hydrateFailure = true;
      return backfill(t);
    }

    /**
     * The `$exception`s recorded. The front door answers a failure with 500 and records nothing until S14 ports the
     * error boundary, so while none is recorded the test ends in the boundary's stub.
     */
    async function exceptionsRecorded(t: TestBackend) {
      const pending = (await t.seed.all("analyticsOutbox")).filter((row) => row.event === "$exception");
      const sent = t.postHog.events().filter((event) => event.event === "$exception");
      if (pending.length + sent.length === 0) throw notPorted("analytics.boundary.recordBoundaryException");
      return [...pending, ...sent];
    }
  });
});

/**
 * A failure as the caller sees it: a front-door answer other than 200 counts, as Convex's rethrown error did. A stub's
 * error is no such failure: it ends the test for `waitsOn`.
 */
async function failed(t: TestBackend, fail: (t: TestBackend) => Promise<unknown>) {
  return fail(t).then(
    (answer) => (answer instanceof Response && answer.status !== 200 ? new Error(`answered ${answer.status}`) : null),
    (error: unknown) => {
      if (error instanceof NotPortedError) throw error;
      return error;
    },
  );
}

/** A plain test when it reaches no stub, and a waiting one otherwise. */
function testOrWait(stacks: Stack[], name: string, body: () => Promise<void>) {
  if (stacks.length === 0) test(name, body);
  else waitsOn(stacks as [Stack, ...Stack[]], name, body);
}

function withStacks(stacks: Stack[], beside: Stack[]): [Stack, ...Stack[]] {
  return [...new Set([...stacks, ...beside])].sort((one, other) => Number(one.slice(1)) - Number(other.slice(1))) as [Stack, ...Stack[]];
}

async function givenBeforeCapture(t: TestBackend, blocks: RichElement[], options: MessageOptions & { ts: string }) {
  forced.beforeCapture = true;
  await post(t, blocks, options);
  await settle(t);
  forced.beforeCapture = false;
  t.slack.withMessage(options.channel ?? "C1", channelMessage(blocks, options));
}

async function leaveAndComeBack(t: TestBackend) {
  await memberChanged(t, "user_change", { id: "U_ALICE", deleted: true });
  await settle(t);
  await memberChanged(t, "user_change", { id: "U_ALICE", deleted: false }, { eventTs: aMinuteLater(t) });
  await settle(t);
}

/** Today's `internal.slack.backfill.backfillWords`, run as its job, then everything it schedules. */
async function backfill(t: TestBackend) {
  await t.run((ctx) => ctx.jobs.enqueue(backfillWordsJob, {}));
  await settle(t);
}

// A maintainer's requests, today's internal mutations in convex/workspace/wordDeletion.ts. The service has no body for
// either until S3 ports that module.
async function forgetWordsOfMember(_t: TestBackend, _request: { workspace: string; user: string }): Promise<void> {
  throw notPorted("workspace.wordDeletion.forgetWordsOfMember");
}

async function forgetWordsOfWorkspace(_t: TestBackend, _request: { workspace: string }): Promise<void> {
  throw notPorted("workspace.wordDeletion.forgetWordsOfWorkspace");
}

function aMinuteLater(t: TestBackend) {
  return `${t.clock.now() / 1000 + 60}`;
}

function textOf(segments: WordSegment[]) {
  return segments.map((segment) => (segment.kind === "text" ? segment.text : "")).join("");
}

async function words(t: TestBackend, ref: Partial<typeof message> = {}) {
  return t.query((ctx) => wordsOf(ctx, { ...message, ...ref }));
}

async function kudosText(t: TestBackend) {
  return stringify(await t.seed.all("kudosTexts"));
}

/** Every domain row and every job, its arguments decoded, as today's helper read Convex's documents and scheduled functions. */
async function storedAndScheduled(t: TestBackend, { besideKudosText = false } = {}) {
  const stored = besideKudosText ? await everythingStored(t, { except: ["kudosTexts"] }) : await everythingStored(t);
  const scheduled = await t.query(({ tx }) => tx.select({ name: jobs.name, args: jobs.args, state: jobs.state, error: jobs.error }).from(jobs));
  return stringify([...stored, ...scheduled.map((job) => ({ ...job, args: decodeStored(job.args) }))]);
}

async function memberIdOf(t: TestBackend, user: string) {
  const member = (await t.seed.all("members")).find((row) => row.workspace === "T1" && row.user === user);
  return member!._id as MemberId;
}

async function stateOfJob(t: TestBackend, name: string) {
  const scheduled = await t.query(({ tx }) => tx.select({ name: jobs.name, state: jobs.state }).from(jobs));
  return scheduled.find((job) => job.name === name)?.state;
}

function stringify(value: unknown) {
  return JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item));
}
