// The spotlight, from outside: which given messages it may draw and the draw itself. A message is drawable while its
// giver is still a member and everyone on it shows on the boards (S11's visibility), so the paths that ask the boards
// wait on S11.
import { describe, expect, test } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { spotlightDraws } from "../db/schema/index.ts";
import type { MemberId } from "../workspace/directory.ts";
import { insertAwards } from "./awards.ts";
import { keepWords } from "./kudosText.ts";
import type { MessageRef } from "./messageEvent.ts";
import { drawFrom, keepSpotlightUpToDate, publicKudosOf, recomputeSpotlightOfJob } from "./spotlight.ts";
import { beforeEveryDrawAt } from "./spotlightDraws.ts";

const backend = useTestBackend({ now: Date.UTC(2026, 9, 13, 10) });
type Backend = ReturnType<typeof backend>;
const ref = (message: string): MessageRef => ({ workspace: "T1", conversation: "C_GENERAL", message });
const wholeCircle = { after: beforeEveryDrawAt(0), through: beforeEveryDrawAt(0) };

async function member(t: Backend, user: string) {
  return (await t.seed.insert("members", { workspace: "T1", user, kind: "member", asOf: 0 })) as MemberId;
}

/** Gives a public kudos message from the giver to the recipients, its words kept, as giving does. */
async function givePublicly(t: Backend, message: string, giver: MemberId, recipients: MemberId[]) {
  await t.run(async (ctx) => {
    await insertAwards(ctx, ref(message), recipients.map((recipient) => ({ giver, recipient, kudos: 1 })), "2026-10-13", ctx.now);
    await keepWords(ctx, { kind: "posted", ref: ref(message), author: "U_ALICE", revision: 1n, at: ctx.now, content: { mentions: [], emoji: ["taco"], text: "thanks" }, words: { segments: [{ kind: "text", text: "thanks" }], visibility: "public" } }, {});
  });
}

const drawn = (t: Backend) => t.query(async ({ tx }) => (await tx.select().from(spotlightDraws)).map(({ message }) => message));

describe("what never reaches the boards", () => {
  test("a message nobody was given is never placed, and an empty spotlight draws nothing", async () => {
    const t = backend();

    await t.run((ctx) => keepSpotlightUpToDate(ctx, ref("m1")));

    expect(await drawn(t), "the draws").toEqual([]);
    expect(await t.query((ctx) => drawFrom(ctx, "T1", wholeCircle)), "the draw").toEqual({ kind: "empty" });
    expect(await t.query((ctx) => publicKudosOf(ctx, ref("m1"))), "public kudos of a message without words").toBeNull();
  });
});

describe("drawable kudos", () => {
  waitsOn(["S11"], "a public kudos message among members on the boards is placed, drawn and answered as public kudos", async () => {
    const t = backend();
    const [alice, bob] = [await member(t, "U_ALICE"), await member(t, "U_BOB")];
    await givePublicly(t, "m1", alice, [bob]);

    await t.run((ctx) => keepSpotlightUpToDate(ctx, ref("m1")));
    const draw = await t.query((ctx) => drawFrom(ctx, "T1", wholeCircle));

    const kudos = { at: t.clock.now(), giver: alice, recipients: [bob], segments: [{ kind: "text", text: "thanks" }], edited: false };
    expect(await drawn(t), "the draws").toEqual(["m1"]);
    expect(draw, "the draw").toMatchObject({ kind: "kudos", drawn: { ref: ref("m1") }, kudos });
    expect(await t.query((ctx) => publicKudosOf(ctx, ref("m1"))), "its public kudos").toEqual(kudos);
  });

  test("a message from someone no longer a member is taken out of the spotlight", async () => {
    const t = backend();
    const bob = await member(t, "U_BOB");
    const gone = (await t.seed.insert("members", { workspace: "T1", user: "U_GONE", kind: "not-a-member", asOf: 0 })) as MemberId;
    await givePublicly(t, "m1", gone, [bob]);
    await t.seed.insert("spotlightDraws", { ...ref("m1"), position: 0.5 });

    await t.run((ctx) => keepSpotlightUpToDate(ctx, ref("m1")));

    expect(await drawn(t), "the draws").toEqual([]);
  });

  waitsOn(["S11"], "a message to more than fifty people is placed by a job, not at once", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");
    const crowd: MemberId[] = [];
    for (let i = 0; i < 51; i++) crowd.push(await member(t, `U_${i}`));
    await givePublicly(t, "m1", alice, crowd);

    await t.run((ctx) => keepSpotlightUpToDate(ctx, ref("m1")));
    const placedAtOnce = await drawn(t);
    await t.settle();

    expect(placedAtOnce, "placed at once").toEqual([]);
    expect(await drawn(t), "placed by the job").toEqual(["m1"]);
  });

  waitsOn(["S11"], "a member who leaves the boards takes every message they gave or received out of the spotlight, a page at a time", async () => {
    const t = backend();
    const [alice, bob, carol] = [await member(t, "U_ALICE"), await member(t, "U_BOB"), await member(t, "U_CAROL")];
    const given = Array.from({ length: 12 }, (_, i) => `given${i}`);
    for (const message of given) {
      t.time.advance(1_000);
      await givePublicly(t, message, alice, [bob]);
      await t.run((ctx) => keepSpotlightUpToDate(ctx, ref(message)));
    }
    await givePublicly(t, "received", carol, [alice]);
    await t.run((ctx) => keepSpotlightUpToDate(ctx, ref("received")));
    await givePublicly(t, "others", carol, [bob]);
    await t.run((ctx) => keepSpotlightUpToDate(ctx, ref("others")));
    const before = (await drawn(t)).sort();

    await t.seed.insert("leaderboardSettings", { member: alice, visible: false });
    await t.run((ctx) => ctx.jobs.enqueue(recomputeSpotlightOfJob, { member: alice, side: "given", before: null }));
    await t.settle();

    expect(before, "drawn before").toEqual([...given, "others", "received"].sort());
    expect(await drawn(t), "drawn after Alice left the boards").toEqual(["others"]);
  });
});
