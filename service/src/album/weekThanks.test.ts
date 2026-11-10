import { describe, expect, test } from "vitest";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { hoggiesFoundIn, teammatesThankedBy } from "./weekThanks.ts";

type MemberId = Id<"members">;

const database = useTestDatabase();
const quiet: Log = { info() {}, error() {} };
const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => Date.parse("2026-11-10T10:00:00Z") }), log: quiet, retryDelayMs: () => 1 });
const seed = seeder(operations);

const aMember = (user: string) => seed.insert("members", { workspace: "T1", user, kind: "member" });

type Given = { kudosGiven?: number; kudosReceived?: number; hugsGiven?: number; hugsReceived?: number };

function aPair(member: MemberId, person: MemberId, { kudosGiven = 0, kudosReceived = 0, hugsGiven = 0, hugsReceived = 0 }: Given) {
  return seed.insert("pairTallies", { member, person, firstThankedAt: null, kudosGiven, kudosReceived, hugsGiven, hugsReceived, best: null });
}

describe("teammatesThankedBy counts the teammates a member has thanked, as today's filter over their pair rows", () => {
  test("a teammate counts once given kudos or a hug, and not for thanks only received", async () => {
    const [alice, bob, carol, dana, erin] = await Promise.all(["U_ALICE", "U_BOB", "U_CAROL", "U_DANA", "U_ERIN"].map(aMember));
    await aPair(alice!, bob!, { kudosGiven: 3 });
    await aPair(alice!, carol!, { hugsGiven: 1 });
    await aPair(alice!, dana!, { kudosGiven: 1, hugsGiven: 2 });
    await aPair(alice!, erin!, { kudosReceived: 5, hugsReceived: 1 });
    await aPair(bob!, alice!, { kudosGiven: 4 });

    expect(await operations.query("test.teammatesThankedBy", (ctx) => teammatesThankedBy(ctx, alice!)), "Bob, Carol and Dana, not Erin").toBe(3);
  });

  test("a member with no pair rows has thanked nobody", async () => {
    const alice = await aMember("U_ALICE");

    expect(await operations.query("test.teammatesThankedBy", (ctx) => teammatesThankedBy(ctx, alice))).toBe(0);
  });

  test("a tally that isn't a number never counts, as today's sum compared in JavaScript", async () => {
    const [alice, bob, carol] = await Promise.all(["U_ALICE", "U_BOB", "U_CAROL"].map(aMember));
    await aPair(alice!, bob!, { kudosGiven: Number.NaN });
    await aPair(alice!, carol!, { kudosGiven: 2, hugsGiven: Number.NaN });

    expect(await operations.query("test.teammatesThankedBy", (ctx) => teammatesThankedBy(ctx, alice!)), "NaN + anything > 0 is false").toBe(0);
  });
});
