// What App Home shows a member about kudos, ported from convex/engine/home.test.ts. Every case starts from the
// directory's answer for the person (S3's `lookup`) and the workspace's settings (S3's `settingsOf`), so the port waits
// on S3. Today's test gave kudos through the engine's `observe`; until 4.4 ports it, these give as `observe` does:
// spend the giver's allowance and insert the awards.
import { describe, expect } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { MemberId } from "../workspace/directory.ts";
import { allowanceDay, dailyAllowance } from "./allowance.ts";
import { insertAwards } from "./awards.ts";
import { homeFacts } from "./home.ts";

const now = Date.parse("2026-10-13T10:00:00Z");
const backend = useTestBackend({ now });
type Backend = ReturnType<typeof backend>;

type Person = "member" | "not-a-member" | { kind: "member"; timeZone: string };

async function withDirectory(people: Record<string, Person>, at = now) {
  const t = backend({ now: at });
  await t.seed.insert("workspaces", { workspace: "T1", baseAllowance: 3, kudosEmoji: "taco" });
  const members = new Map<string, MemberId>();
  for (const [user, person] of Object.entries(people)) {
    const fields = typeof person === "string" ? { kind: person } : person;
    members.set(user, (await t.seed.insert("members", { workspace: "T1", user, asOf: 0, ...fields })) as MemberId);
  }
  return { t, members };
}

async function give(t: Backend, members: Map<string, MemberId>, giver: string, recipient: string, kudos: number, message: string) {
  await t.run(async (ctx) => {
    const day = allowanceDay(ctx.now, undefined);
    await (await dailyAllowance(ctx, members.get(giver)!, day, 3)).spend(kudos);
    await insertAwards(ctx, { workspace: "T1", conversation: "C1", message }, [{ giver: members.get(giver)!, recipient: members.get(recipient)!, kudos }], day, ctx.now);
  });
}

const factsOf = (t: Backend, user: string) => t.query((ctx) => homeFacts(ctx, "T1", user));

async function refillOf(t: Backend, user: string) {
  const facts = await factsOf(t, user);
  return facts?.kind === "member" ? facts.refillsAt : undefined;
}

describe("R45 R46: homeFacts reads what App Home shows", () => {
  waitsOn(["S3"], "a member's facts are the allowance left of the base, the kudos emoji, and the kudos given and received this week and in total", async () => {
    const { t, members } = await withDirectory({ U_ALICE: "member", U_BOB: "member", U_CAROL: "member" });
    await give(t, members, "U_ALICE", "U_BOB", 2, "1");
    await give(t, members, "U_BOB", "U_CAROL", 1, "2");

    expect(await factsOf(t, "U_BOB")).toEqual({
      kind: "member",
      left: 2,
      base: 3,
      kudosEmoji: "taco",
      refillsAt: Date.parse("2026-10-14T00:00:00Z"),
      givenWeek: 1,
      receivedWeek: 2,
      given: 1,
      received: 2,
    });
  });

  waitsOn(["S3"], "a person the directory knows as not a member is told so", async () => {
    const { t } = await withDirectory({ U_GUEST: "not-a-member" });

    expect(await factsOf(t, "U_GUEST")).toEqual({ kind: "not-a-member" });
  });

  waitsOn(["S3"], "a person the directory doesn't know yet has no facts", async () => {
    const { t } = await withDirectory({});

    expect(await factsOf(t, "U_STRANGER")).toBeNull();
  });
});

describe("WS13: homeFacts carries when the member's allowance refills", () => {
  waitsOn(["S3"], "the allowance refills at the member's next local midnight", async () => {
    const { t } = await withDirectory({ U_ALICE: { kind: "member", timeZone: "America/New_York" } });

    expect(await refillOf(t, "U_ALICE")).toBe(Date.parse("2026-10-14T04:00:00Z"));
  });

  waitsOn(["S3"], "a member without a time zone refills at midnight UTC", async () => {
    const { t } = await withDirectory({ U_ALICE: "member" });

    expect(await refillOf(t, "U_ALICE")).toBe(Date.parse("2026-10-14T00:00:00Z"));
  });

  waitsOn(["S3"], "a member whose local midnight has just passed refills at the midnight after", async () => {
    const { t } = await withDirectory({ U_ALICE: { kind: "member", timeZone: "Europe/Berlin" } }, Date.parse("2026-10-13T22:00:00Z"));

    expect(await refillOf(t, "U_ALICE")).toBe(Date.parse("2026-10-14T22:00:00Z"));
  });

  waitsOn(["S3"], "the night the clocks go back, the allowance refills at local midnight, not 24 hours after the last one", async () => {
    const { t } = await withDirectory({ U_ALICE: { kind: "member", timeZone: "Europe/Berlin" } }, Date.parse("2026-10-25T12:00:00Z"));

    expect(await refillOf(t, "U_ALICE")).toBe(Date.parse("2026-10-25T23:00:00Z"));
  });
});
