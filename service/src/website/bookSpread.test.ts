import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { memberDecision } from "../analytics/flags.ts";
import { createClock } from "../clock.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { useTestDatabase } from "../../testing/database.ts";
import type { FakePostHog } from "../../testing/fakePostHog.ts";
import { flagsFromPostHog, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { bookSpreadFlag, bookSpreadShownTo } from "./bookSpread.ts";

const database = useTestDatabase();
const quiet: Log = { info() {}, error() {} };
const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => Date.parse("2026-11-10T10:00:00Z") }), log: quiet, retryDelayMs: () => 1 });
const seed = seeder(operations);

let postHog: FakePostHog;

beforeEach(() => {
  postHog = postHogDeciding("sandbox");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function aMemberDecidedOnce() {
  const member = await seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member" });
  await operations.mutation("test.analyticsId", (ctx) => memberDecision(ctx, bookSpreadFlag, member));
  return member;
}

const shownTo = (member: Awaited<ReturnType<typeof aMemberDecidedOnce>>) => operations.query("test.bookSpreadShownTo", (ctx) => bookSpreadShownTo(ctx, member));

describe("bookSpreadShownTo marks the book as a spread for the members its flag is on for", () => {
  test("the flag on answers bookSpread", async () => {
    await flagsFromPostHog(operations, postHog, onForEveryone(bookSpreadFlag.key));
    const alice = await aMemberDecidedOnce();

    expect(await shownTo(alice)).toEqual({ bookSpread: true });
  });

  test("the flag off answers nothing, so the page keeps its single pages", async () => {
    await flagsFromPostHog(operations, postHog, offForEveryone(bookSpreadFlag.key));
    const alice = await aMemberDecidedOnce();

    expect(await shownTo(alice)).toEqual({});
  });
});
