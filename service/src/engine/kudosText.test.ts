// A kudos message's words, from outside: kept as it is given and edited, a tombstone once it is deleted, no longer kudos
// or removed, dropped from the spotlight with it, and forgotten for an author or a workspace a page at a time. Reading
// the words back checks whether their author still belongs (S3's directory), so those reads wait on S3.
import { describe, expect, test } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { toDocument } from "../db/documents.ts";
import { kudosTexts, spotlightDraws, wordDeletionRequests, type Doc } from "../db/schema/index.ts";
import type { MemberId } from "../workspace/directory.ts";
import {
  deletionRequested,
  forgetDeleted,
  forgetWords,
  forgetWordsAuthoredBy,
  forgetWordsInWorkspace,
  forgetWordsOfGiven,
  hasKudosText,
  keepFetchedWords,
  keepWords,
  recordDeletionRequest,
  removeWords,
  takenBackInSlack,
  wordsOf,
} from "./kudosText.ts";
import type { MessageEvent, MessageRef } from "./messageEvent.ts";
import { placeInSpotlight } from "./spotlightDraws.ts";

const backend = useTestBackend();
type Backend = ReturnType<typeof backend>;
const ref = (message: string, workspace = "T1"): MessageRef => ({ workspace, conversation: "C_GENERAL", message });
const thoughtful = { gate: { version: 1, thoughtful: true } };

function said(message: MessageRef, text: string, revision: bigint, { kind = "posted", author = "U_ALICE" }: { kind?: MessageEvent["kind"]; author?: string } = {}): MessageEvent {
  return {
    kind,
    ref: message,
    author,
    revision,
    at: 0,
    content: { mentions: [{ kind: "person", user: "U_BOB" }], emoji: ["taco"], text },
    words: { segments: [{ kind: "text", text }], visibility: "public" },
  };
}

async function stored(t: Backend, message: MessageRef) {
  const rows = await t.query(({ tx }) => tx.select().from(kudosTexts));
  const row = rows.map((one) => toDocument<Doc<"kudosTexts">>(kudosTexts, one)).find((one) => one.workspace === message.workspace && one.message === message.message);
  if (row === undefined) return undefined;
  const { _id, _creationTime, workspace, conversation, message: _message, ...kept } = row;
  return kept;
}

describe("keeping a message's words", () => {
  test("the words of the newest revision stand, an edit marks them edited, and the gate's note is kept", async () => {
    const t = backend();

    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "thanks", 2n), thoughtful));
    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "an older revision", 1n, { kind: "edited" }), {}));
    const afterOlder = await stored(t, ref("m1"));
    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "thanks for the deploy", 3n, { kind: "edited" }), {}));

    expect(afterOlder, "after an older revision").toEqual({ kind: "words", revision: 2n, author: "U_ALICE", edited: false, segments: [{ kind: "text", text: "thanks" }], visibility: "public", gate: { version: 1, thoughtful: true } });
    expect(await stored(t, ref("m1")), "after a newer edit").toMatchObject({ revision: 3n, edited: true, segments: [{ kind: "text", text: "thanks for the deploy" }], gate: null });
    expect(await t.query((ctx) => hasKudosText(ctx, ref("m1"))), "has words").toBe(true);
  });

  test("words fetched from Slack are kept with their visibility unknown", async () => {
    const t = backend();

    await t.run((ctx) => keepFetchedWords(ctx, { ref: ref("m1"), author: "U_ALICE", revision: 1n, edited: true, content: { mentions: [], emoji: [], text: "thanks" }, segments: [{ kind: "text", text: "thanks" }] }, {}));

    expect(await stored(t, ref("m1")), "the fetched words").toMatchObject({ kind: "words", edited: true, visibility: "unknown", gate: null });
  });
});

describe("tombstones", () => {
  test("a deleted message's words become a tombstone, taken back in Slack, and new words never replace it", async () => {
    const t = backend();
    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "thanks", 1n), {}));

    await t.run((ctx) => forgetDeleted(ctx, ref("m1")));
    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "thanks again", 2n, { kind: "edited" }), {}));

    expect(await stored(t, ref("m1")), "the tombstone").toEqual({ kind: "tombstone", why: "deleted" });
    expect(await t.query((ctx) => wordsOf(ctx, ref("m1"))), "the words").toEqual({ kind: "unavailable", reason: "deleted" });
    expect(await t.query((ctx) => takenBackInSlack(ctx, ref("m1"))), "taken back").toBe(true);
  });

  test("a message no longer kudos keeps a tombstone that its next kudos words replace", async () => {
    const t = backend();
    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "thanks", 1n), {}));

    await t.run((ctx) => forgetWords(ctx, ref("m1")));
    const forgotten = await stored(t, ref("m1"));
    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "thanks after all", 2n, { kind: "edited" }), {}));

    expect(forgotten, "no longer kudos").toEqual({ kind: "tombstone", why: "no-longer-kudos" });
    expect(await stored(t, ref("m1")), "kudos again").toMatchObject({ kind: "words", revision: 2n, edited: true });
  });

  test("a given message never captured still gets its tombstone, and removed words aren't taken back in Slack", async () => {
    const t = backend();
    await t.run((ctx) => keepWords(ctx, said(ref("m2"), "thanks", 1n), {}));

    await t.run((ctx) => forgetWordsOfGiven(ctx, ref("m1")));
    await t.run((ctx) => removeWords(ctx, ref("m2")));

    expect(await stored(t, ref("m1")), "never captured").toEqual({ kind: "tombstone", why: "no-longer-kudos" });
    expect(await t.query((ctx) => wordsOf(ctx, ref("m2"))), "removed words").toEqual({ kind: "unavailable", reason: "removed" });
    expect(await t.query((ctx) => takenBackInSlack(ctx, ref("m2"))), "removed isn't taken back").toBe(false);
    expect(await t.query((ctx) => wordsOf(ctx, ref("m3"))), "never kept").toEqual({ kind: "unavailable", reason: "not-captured" });
  });

  test("a tombstone takes the message out of the spotlight", async () => {
    const t = backend();
    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "thanks", 1n), {}));
    await t.run((ctx) => placeInSpotlight(ctx, ref("m1"), true));

    await t.run((ctx) => forgetDeleted(ctx, ref("m1")));

    expect(await t.query(({ tx }) => tx.select().from(spotlightDraws)), "the draws").toEqual([]);
  });
});

describe("forgetting on request", () => {
  test("a deletion request is recorded once, for an author or the whole workspace", async () => {
    const t = backend();

    await t.run((ctx) => recordDeletionRequest(ctx, { workspace: "T1", author: "U_ALICE" }));
    await t.run((ctx) => recordDeletionRequest(ctx, { workspace: "T1", author: "U_ALICE" }));
    await t.run((ctx) => recordDeletionRequest(ctx, { workspace: "T2", author: null }));
    const requests = await t.query(({ tx }) => tx.select().from(wordDeletionRequests));

    expect(requests, "the requests").toHaveLength(2);
    expect(await t.query((ctx) => deletionRequested(ctx, { workspace: "T1", author: "U_ALICE" })), "Alice in T1").toBe(true);
    expect(await t.query((ctx) => deletionRequested(ctx, { workspace: "T1", author: "U_BOB" })), "Bob in T1").toBe(false);
    expect(await t.query((ctx) => deletionRequested(ctx, { workspace: "T2", author: "U_BOB" })), "anyone in T2").toBe(true);
  });

  test("an author's words are removed a page at a time until none is left, and no one else's", async () => {
    const t = backend();
    for (let i = 0; i < 12; i++) await t.run((ctx) => keepWords(ctx, said(ref(`a${i}`), "thanks", 1n), {}));
    await t.run((ctx) => keepWords(ctx, said(ref("b"), "thanks", 1n, { author: "U_BOB" }), {}));

    await t.run((ctx) => forgetWordsAuthoredBy(ctx, { workspace: "T1", author: "U_ALICE" }));
    const afterOnePage = await t.query(({ tx }) => tx.select().from(kudosTexts));
    const settled = await t.settle();
    const kinds = (await t.query(({ tx }) => tx.select().from(kudosTexts))).map(({ author, kind, why }) => [author ?? "", kind, why ?? ""].join(" "));

    expect(afterOnePage.filter(({ kind }) => kind === "tombstone"), "after one page").toHaveLength(10);
    expect(settled.ran, "the next page, then a last empty one").toEqual(["engine.kudosText.forgetAuthoredWords"]);
    expect(kinds.filter((kind) => kind === " tombstone removed"), "Alice's words").toHaveLength(12);
    expect(kinds.filter((kind) => kind === "U_BOB words "), "Bob's words").toHaveLength(1);
  });

  test("a workspace's words are removed a page at a time, and no other workspace's", async () => {
    const t = backend();
    for (let i = 0; i < 12; i++) await t.run((ctx) => keepWords(ctx, said(ref(`a${i}`), "thanks", 1n), {}));
    await t.run((ctx) => keepWords(ctx, said(ref("x", "T2"), "thanks", 1n), {}));

    await t.run((ctx) => forgetWordsInWorkspace(ctx, { workspace: "T1", cursor: null }));
    const settled = await t.settle();
    const rows = await t.query(({ tx }) => tx.select().from(kudosTexts));

    expect(settled.ran, "the next page").toEqual(["engine.kudosText.forgetWorkspaceWords"]);
    expect(rows.filter(({ workspace, kind }) => workspace === "T1" && kind === "words"), "T1's words").toEqual([]);
    expect(rows.filter(({ workspace, kind }) => workspace === "T2" && kind === "words"), "T2's words").toHaveLength(1);
  });
});

describe("reading the words back", () => {
  waitsOn(["S3"], "kept words read back as the message's text while their author belongs", async () => {
    const t = backend();
    await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", asOf: 0 });
    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "thanks", 1n), thoughtful));

    expect(await t.query((ctx) => wordsOf(ctx, ref("m1"))), "the words").toEqual({
      kind: "text",
      segments: [{ kind: "text", text: "thanks" }],
      edited: false,
      visibility: "public",
      author: "U_ALICE",
      gate: { version: 1, thoughtful: true },
    });
  });

  waitsOn(["S3"], "the words of an author who left are removed, and a leaver's words are forgotten when they leave", async () => {
    const t = backend();
    const alice = (await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", asOf: 0 })) as MemberId;
    await t.run((ctx) => keepWords(ctx, said(ref("m1"), "thanks", 1n), {}));

    await t.run(async (ctx) => {
      const left = { type: "memberLeft", workspace: "T1", member: alice, at: ctx.now };
      await ctx.publish(left);
    });
    await t.settle();

    expect(await stored(t, ref("m1")), "the leaver's words").toEqual({ kind: "tombstone", why: "removed" });
    expect(await t.query((ctx) => deletionRequested(ctx, { workspace: "T1", author: "U_ALICE" })), "their deletion request").toBe(true);
  });
});
