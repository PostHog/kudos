// The spotlight's draws, from outside: a message placed once and dropped, and a walk along the positions that draws
// each message between two draw points once, wrapping past the last position.
import { describe, expect, test } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { spotlightDraws } from "../db/schema/index.ts";
import type { MessageRef } from "./messageEvent.ts";
import { beforeEveryDrawAt, drawnAlong, dropFromSpotlight, placeInSpotlight, type DrawWalk } from "./spotlightDraws.ts";

const backend = useTestBackend();
type Backend = ReturnType<typeof backend>;
const ref = (message: string, workspace = "T1"): MessageRef => ({ workspace, conversation: "C_GENERAL", message });

async function draws(t: Backend, workspace = "T1") {
  return t.query(async ({ tx }) => {
    return (await tx.select().from(spotlightDraws)).filter((row) => row.workspace === workspace).map(({ message }) => message);
  });
}

async function walked(t: Backend, walk: DrawWalk, workspace = "T1") {
  return t.query(async (ctx) => {
    const seen: string[] = [];
    for await (const { ref } of drawnAlong(ctx, workspace, walk)) seen.push(ref.message);
    return seen;
  });
}

describe("placing a message in the spotlight", () => {
  test("a drawable message holds one draw however often it is placed, and is dropped when it no longer is", async () => {
    const t = backend();

    await t.run((ctx) => placeInSpotlight(ctx, ref("m1"), true));
    await t.run((ctx) => placeInSpotlight(ctx, ref("m1"), true));
    const placed = await draws(t);
    await t.run((ctx) => dropFromSpotlight(ctx, ref("m1")));

    expect(placed, "placed twice").toEqual(["m1"]);
    expect(await draws(t), "dropped").toEqual([]);
  });

  test("a message that was never drawable is not placed", async () => {
    const t = backend();

    await t.run((ctx) => placeInSpotlight(ctx, ref("m1"), false));

    expect(await draws(t), "the draws").toEqual([]);
  });
});

describe("walking the draws", () => {
  async function seeded() {
    const t = backend();
    for (const [message, position] of [["a", 0.1], ["b", 0.4], ["c", 0.4], ["d", 0.7], ["e", 0.9]] as const) {
      t.time.advance(1_000);
      await t.seed.insert("spotlightDraws", { ...ref(message), position });
    }
    await t.seed.insert("spotlightDraws", { ...ref("other", "T2"), position: 0.5 });
    const created = await t.query(async ({ tx }) => {
        return new Map((await tx.select().from(spotlightDraws)).map(({ message, position, _creationTime }) => [message, { position, created: _creationTime }]));
    });
    return { t, at: (message: string) => created.get(message)! };
  }

  test("from one draw through a later one, each between them once, in position order, ties by when they were placed", async () => {
    const { t, at } = await seeded();

    expect(await walked(t, { after: at("a"), through: at("d") }), "after a through d").toEqual(["b", "c", "d"]);
    expect(await walked(t, { after: at("b"), through: at("c") }), "after b through c, tied").toEqual(["c"]);
  });

  test("a walk past the last position wraps to the first, and never leaves the workspace", async () => {
    const { t, at } = await seeded();

    expect(await walked(t, { after: at("d"), through: at("b") }), "after d through b").toEqual(["e", "a", "b"]);
    expect(await walked(t, { after: beforeEveryDrawAt(0.4), through: beforeEveryDrawAt(0.4) }), "the whole circle from 0.4").toEqual(["b", "c", "d", "e", "a"]);
  });
});
