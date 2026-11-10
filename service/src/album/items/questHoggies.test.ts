// Port of convex/album/items/questHoggies.test.ts.
import { describe, expect, test } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import type { QuestFinishedEvent } from "../../bus/events.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { earnQuestHoggie } from "./questHoggies.ts";

const at = new Date("2026-10-13T10:00:00Z").getTime();
const backend = useTestBackend({ now: at });

describe("HH24: Album earns a quest's hoggie from questFinished", () => {
  test("a member who left earns nothing, and nothing throws", async () => {
    const t = backend();
    const bob = await member(t, "U_BOB", "not-a-member");

    await t.run((ctx) => earnQuestHoggie(ctx, { event: mondayFinish(bob) }));

    expect(await itemsOf(t, bob)).toEqual([]);
  });

  test("a finish without a reward key, as the unlock path publishes it, earns nothing", async () => {
    const t = backend();
    const bob = await member(t, "U_BOB", "member");
    const { rewardKey: _, ...unlockPathFinish } = mondayFinish(bob);

    await t.run((ctx) => earnQuestHoggie(ctx, { event: unlockPathFinish }));

    expect(await itemsOf(t, bob)).toEqual([]);
  });
});

function mondayFinish(member: MemberId): QuestFinishedEvent {
  return { type: "questFinished", workspace: "T1", member, quest: { kind: "journey", step: "first-thanks" }, rewardKey: "journey:first-thanks", reward: { xp: 50, coins: 0 }, catalogueVersion: "monday-1", at };
}

function member(t: TestBackend, user: string, kind: "member" | "not-a-member") {
  return t.seed.insert("members", { workspace: "T1", user, kind }) as Promise<MemberId>;
}

async function itemsOf(t: TestBackend, member: MemberId) {
  return (await t.seed.all("items")).filter((item) => item.member === member);
}
