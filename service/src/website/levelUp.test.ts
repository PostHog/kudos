// getLevelUp answers one level up's reveal. Today's convex/website/levelUp.test.ts, on the service's test backend.
// getLevelUp is S16's website handler; reaching a level runs S6's unlocks and S10's level-up hoggies, and the reveal reads album/levelUp.ts (S9).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { stillWaiting, waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { openTheRegistryIn } from "../album/emojiNames.ts";
import { catalogue, hoggieNamed, type Rarity } from "../album/hoggies/catalogue.ts";
import { drawOf } from "../album/hoggies/draw.ts";
import { earnLevelUpHoggies } from "../album/levelUpHoggies.ts";
import type { LevelUpAnswer } from "../album/levelUp.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import { makeReady } from "../unlocks/unlocks.ts";
import type { MemberId } from "../workspace/directory.ts";
import { getLevelUp } from "./album.ts";
import type { VerifiedMember } from "./memberQuery.ts";

const now = new Date("2026-10-20T10:00:00Z");
const hourMs = 60 * 60 * 1000;
const juno = { user: "U_JUNO", name: "Juno Park" };
const revealOn = ["album", "collection", "level-up-reveal"];
// Reaching a level (S6's unlocks, S10's level-up hoggies), the reveal (album/levelUp.ts, S9) and S16's handler.
const reachingAndRevealing: [Stack, ...Stack[]] = ["S6", "S9", "S10", "S16"];

const backend = useTestBackend({ now: now.getTime(), workspace: "T1" });

let t: TestBackend;

beforeEach(() => {
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  t = backend();
  t.slack.withMember(juno.user, { profile: { display_name: juno.name, real_name: juno.name } });
});

afterEach(() => void vi.unstubAllEnvs());

// Today's `switchWebsite`: the website open, these flags on for everyone, and the workspace's key made.
async function switchWebsite(...flags: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

async function junoWith(...flags: string[]): Promise<MemberId> {
  await switchWebsite(...flags);
  return t.seed.insert("members", { workspace: "T1", user: juno.user, kind: "member", asOf: 0 }) as Promise<MemberId>;
}

async function levelUpOf(level: number) {
  const me = await junoSignedIn();
  return t.query((ctx) => getLevelUp(ctx, me, { level }));
}

async function revealOf(level: number): Promise<LevelUpAnswer> {
  const answer = await levelUpOf(level);
  if (answer.kind !== "levelUp") throw new Error(`getLevelUp answered ${answer.kind} for level ${level}`);
  return answer;
}

// Today's `reachesLevel`: the levelReached event an hour on, through unlocks' `makeReady` and `earnLevelUpHoggies`.
async function reaches(member: MemberId, level: number) {
  t.time.advance(hourMs);
  const at = t.clock.now();
  const event: LevelReachedEvent = { type: "levelReached", workspace: "T1", member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message: { workspace: "T1", conversation: "C1", message: `level-${level}-${member}` }, at };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
  return at;
}

async function junoSignedIn(): Promise<VerifiedMember> {
  const row = (await t.seed.all("members")).find(({ workspace, user }) => workspace === "T1" && user === juno.user);
  if (row === undefined) throw new Error("Juno is no member");
  return { member: row._id as MemberId, workspace: "T1", user: juno.user, name: juno.name };
}

const slots: ReadonlyArray<{ slot: number; floor?: Rarity }> = [{ slot: 1 }, { slot: 2 }, { slot: 3, floor: "rare" }];

async function drawnAt(secret: string, member: MemberId, level: number): Promise<string[]> {
  return Promise.all(slots.map(async ({ slot, floor }) => (await drawOf({ secret, member, crate: `level:${level}:${slot}`, version: catalogue.version, ...(floor && { floor }) })).hoggie));
}

async function aSecretWhere(member: MemberId, drawsWanted: (draws: Map<number, string[]>) => boolean, levels: number[]) {
  for (let attempt = 0; ; attempt++) {
    const secret = `level-up-secret-${attempt}`;
    const draws = new Map(await Promise.all(levels.map(async (level) => [level, await drawnAt(secret, member, level)] as const)));
    if (drawsWanted(draws)) {
      vi.stubEnv("HOGGIE_DRAW_SECRET", secret);
      return draws;
    }
  }
}

function allDifferent(hoggies: string[]) {
  return new Set(hoggies).size === hoggies.length;
}

function found(hoggie: string, copy = 1) {
  const { name, rarity } = hoggieNamed(hoggie)!;
  return { hoggie, name, rarity, art: { kind: "hoggie", slug: hoggie }, copy, isNew: copy === 1 };
}

function levelEmoji(level: number, earnedAt: number) {
  return { id: `level:${level}`, kind: "level", name: `level-${level}`, from: `Level ${level}`, picture: `/emoji/level-${level}.png`, earned: true, earnedAt, seen: false, inSlack: false, progress: null };
}

describe("getLevelUp answers one level up's reveal", () => {
  waitsOn(reachingAndRevealing, "a level up answers its level, when it was reached and its three hoggies in slot order, each shown like any drop", async () => {
    const member = await junoWith(...revealOn);
    const draws = await aSecretWhere(member, (drawn) => allDifferent(drawn.get(3)!), [3]);
    const at = await reaches(member, 3);

    expect(await levelUpOf(3)).toEqual({ kind: "levelUp", level: 3, at, hoggies: draws.get(3)!.map((hoggie) => found(hoggie)), emojis: [] });
  }, 60_000);

  waitsOn(reachingAndRevealing, "a hoggie found before shows as a spare", async () => {
    const member = await junoWith(...revealOn);
    const draws = await aSecretWhere(member, (drawn) => drawn.get(3)![0] === drawn.get(2)![0] && allDifferent([...drawn.get(2)!, ...drawn.get(3)!.slice(1)]), [2, 3]);
    await reaches(member, 2);
    await reaches(member, 3);

    const [again, second, third] = draws.get(3)!;
    expect((await revealOf(3)).hoggies).toEqual([found(again!, 2), found(second!), found(third!)]);
  }, 60_000);

  // Today's `reserveSharedEmojiNames` for one workspace is the registry's opening, `openTheRegistryIn`.
  waitsOn(reachingAndRevealing, "a level up answers the level emojis above the member's previous level up and up to its own, in level order, and none it earned before", async () => {
    const member = await junoWith(...revealOn);
    await t.run((ctx) => openTheRegistryIn(ctx, "T1"));
    await reaches(member, 4);
    const atTen = await reaches(member, 10);
    await reaches(member, 11);

    expect((await revealOf(10)).emojis).toEqual([levelEmoji(5, atTen), levelEmoji(10, atTen)]);
    expect((await revealOf(11)).emojis).toEqual([]);
  }, 60_000);

  waitsOn(reachingAndRevealing, "a level the member never reached, or reached before its hoggies dropped, answers none", async () => {
    const member = await junoWith("album", "collection");
    await reaches(member, 2);
    await switchWebsite(...revealOn);
    await reaches(member, 3);

    expect(await levelUpOf(2)).toEqual({ kind: "none" });
    expect(await levelUpOf(7)).toEqual({ kind: "none" });
  }, 60_000);

  test.each([
    ["level-up-reveal is off", ["album", "collection"]],
    ["the album is off", ["collection", "level-up-reveal"]],
    ["hidden-items is on", [...revealOn, "hidden-items"]],
  ])(`while %s, a level up that dropped its hoggies answers off (waits on ${reachingAndRevealing.join(" ")})`, async (_, flags) => {
    await stillWaiting(reachingAndRevealing, async () => {
      const member = await junoWith(...revealOn);
      await reaches(member, 3);
      await switchWebsite(...flags);

      expect(await levelUpOf(3)).toEqual({ kind: "off" });
    });
  }, 60_000);
});
