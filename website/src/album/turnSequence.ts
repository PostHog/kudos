import type { ReachedTier } from "../../../convex/album/milestones";
import type { TurnAnswer } from "../../../convex/website/album";
import { medalKeyOf } from "./milestones";
import type { AlbumEmoji } from "./answer";

export type Turned = Extract<TurnAnswer, { kind: "turned" }>;

export type EmojiSource = { kind: "hype"; name: string } | { kind: "team"; team: string } | { kind: "medal"; tier: ReachedTier };

export type FlightStage = "lift" | "turn" | "hold" | "land" | "unlock" | "medal" | "rest" | "back";

export const buildSpeed = 0.8;

const atBuildSpeed = (prototypeMs: number) => prototypeMs / buildSpeed;

export const turnTiming = {
  pickUpMs: 30,
  liftMs: atBuildSpeed(560),
  asideMs: atBuildSpeed(200),
  pageDrawnMs: 80,
  settleMs: 30,
  flipMs: atBuildSpeed(720),
  burstAfterMs: atBuildSpeed(330),
  captionAfterMs: 40,
  holdMs: atBuildSpeed(650),
  chipAfterMs: atBuildSpeed(200),
  chipFlightMs: atBuildSpeed(820),
  darkMs: atBuildSpeed(220),
  jumpMs: 30,
  lightMs: atBuildSpeed(260),
  aboveMs: atBuildSpeed(420),
  dropMs: atBuildSpeed(190),
  fitMs: atBuildSpeed(260),
  popMs: atBuildSpeed(520),
  squashMs: atBuildSpeed(200),
  unlockAfterMs: atBuildSpeed(380),
  sealPopMs: atBuildSpeed(760),
  unlockHoldMs: atBuildSpeed(1300),
  medalAfterMs: atBuildSpeed(380),
  medalInMs: atBuildSpeed(1000),
  medalHoldMs: atBuildSpeed(1100),
  medalDownMs: atBuildSpeed(560),
  medalStampMs: atBuildSpeed(520),
  medalXpAfterMs: atBuildSpeed(500),
  medalXpMs: atBuildSpeed(1500),
  restMs: atBuildSpeed(800),
  backMs: atBuildSpeed(420),
  pageWaitMs: 2000,
  pageLookMs: 50,
};

export type TurnClock = {
  sleep: (ms: number) => Promise<void>;
  until: (ready: () => boolean, ms: number) => Promise<boolean>;
  animate: (element: Element | null | undefined, keyframes: Keyframe[], options: { duration: number; easing?: string }) => Promise<void>;
  skip: () => void;
  timeAgain: () => void;
  stop: () => void;
  isStopped: () => boolean;
};

export function turnClock(): TurnClock {
  let skipping = false;
  let stopped = false;
  const waiting = new Set<() => void>();
  const running = new Set<Animation>();
  const sleep = (ms: number) => {
    if (skipping) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        window.clearTimeout(timer);
        waiting.delete(done);
        resolve();
      };
      const timer = window.setTimeout(done, ms);
      waiting.add(done);
    });
  };
  const skip = () => {
    skipping = true;
    running.forEach((animation) => animation.finish());
    [...waiting].forEach((done) => done());
  };
  return {
    sleep,
    async until(ready, ms) {
      for (let waited = 0; !ready() && !skipping; waited += turnTiming.pageLookMs) {
        if (waited >= ms) return false;
        await sleep(turnTiming.pageLookMs);
      }
      return ready();
    },
    async animate(element, keyframes, { duration, easing }) {
      const animation = typeof element?.animate === "function" ? element.animate(keyframes, { duration, easing, fill: "forwards" }) : null;
      if (animation !== null) running.add(animation);
      if (skipping) animation?.finish();
      await sleep(duration);
      if (animation !== null) running.delete(animation);
    },
    skip,
    timeAgain() {
      skipping = stopped;
    },
    stop() {
      stopped = true;
      skip();
    },
    isStopped: () => stopped,
  };
}

export type TurnSteps = {
  stage: (stage: FlightStage) => void;
  darken: (dark: boolean) => void;
  lift: () => Promise<void>;
  goToThePage: (turned: Turned) => void;
  flip: () => Promise<void>;
  burst: () => void;
  caption: () => void;
  payTheXp: (xp: number) => Promise<void>;
  slotDrawn: () => boolean;
  slotInView: () => boolean;
  jumpToTheSlot: () => void;
  aboveTheSlot: () => Promise<void>;
  dropIntoTheSlot: () => Promise<void>;
  landed: () => void;
  landWithoutTheFlight: () => void;
  squash: () => Promise<void>;
  sealInView: (team: string) => boolean;
  goToTheTeam: (team: string) => void;
  jumpToTheSeal: (team: string) => void;
  unlockTheTeam: (team: string) => Promise<void>;
  endTheUnlock: () => void;
  medalComing: (tier: ReachedTier) => void;
  medalInView: (tier: ReachedTier) => boolean;
  goToTheMilestones: () => void;
  jumpToTheMedal: (tier: ReachedTier) => void;
  showTheMedal: (tier: ReachedTier, xp: number) => Promise<void>;
  stampTheMedal: (tier: ReachedTier) => Promise<void>;
  payTheMedal: (tier: ReachedTier, xp: number) => Promise<void>;
  endTheMedal: () => void;
  sendTheEmojiUp: (source: EmojiSource) => Promise<void>;
  nothingWaits: () => boolean;
};

type FollowUp = (clock: TurnClock, steps: TurnSteps) => Promise<void>;

export async function playTurn(clock: TurnClock, steps: TurnSteps, answer: Promise<Turned | null>): Promise<Turned | null> {
  await clock.sleep(turnTiming.pickUpMs);
  steps.stage("lift");
  const lifting = steps.lift();
  const turned = await crossFadeToThePage(clock, steps, answer);
  if (turned === null) return null;
  await lifting;
  await clock.sleep(turnTiming.settleMs);
  await turnOver(clock, steps);
  if (!(await holdThenFadeToTheSlot(clock, steps, turned.applied?.xp ?? 0))) {
    steps.landWithoutTheFlight();
    return turned;
  }
  await dropIn(clock, steps);
  for (const followUp of followUpsOf(turned)) await followUp(clock, steps);
  clock.timeAgain();
  await rest(clock, steps);
  return turned;
}

async function crossFadeToThePage(clock: TurnClock, steps: TurnSteps, answer: Promise<Turned | null>) {
  steps.darken(true);
  await clock.sleep(turnTiming.asideMs);
  const turned = await answer;
  if (turned === null) return null;
  steps.goToThePage(turned);
  await clock.sleep(turnTiming.pageDrawnMs);
  steps.darken(false);
  return turned;
}

async function turnOver(clock: TurnClock, steps: TurnSteps) {
  steps.stage("turn");
  const turning = steps.flip();
  await clock.sleep(turnTiming.burstAfterMs);
  steps.burst();
  await turning;
}

async function holdThenFadeToTheSlot(clock: TurnClock, steps: TurnSteps, xp: number) {
  await clock.sleep(turnTiming.captionAfterMs);
  steps.stage("hold");
  steps.caption();
  const paying = steps.payTheXp(xp);
  await clock.sleep(turnTiming.holdMs);
  const drawn = await clock.until(steps.slotDrawn, turnTiming.pageWaitMs);
  if (drawn && !steps.slotInView()) await fadeTo(clock, steps, steps.jumpToTheSlot);
  await paying;
  return drawn;
}

async function fadeTo(clock: TurnClock, steps: TurnSteps, jump: () => void) {
  steps.darken(true);
  await clock.sleep(turnTiming.darkMs);
  jump();
  await clock.sleep(turnTiming.jumpMs);
  steps.darken(false);
  await clock.sleep(turnTiming.lightMs);
}

async function dropIn(clock: TurnClock, steps: TurnSteps) {
  steps.stage("land");
  await steps.aboveTheSlot();
  await steps.dropIntoTheSlot();
  steps.landed();
  await steps.squash();
}

function followUpsOf(turned: Turned): FollowUp[] {
  return [...hypeBeatOf(turned), ...turned.unlocked.teamStickers.map(({ team }) => teamUnlockOf(team)), ...milestoneBeatsOf(turned.unlocked)];
}

export function emojiSourcesOf(turned: Turned): EmojiSource[] {
  const { unlocked } = turned;
  return [...hypeOf(turned), ...unlocked.teamStickers.map(({ team }): EmojiSource => ({ kind: "team", team })), ...unlocked.milestones.map((tier): EmojiSource => ({ kind: "medal", tier }))];
}

export function isTheEmojiOf(source: EmojiSource, emoji: AlbumEmoji) {
  switch (source.kind) {
    case "hype":
      return emoji.kind === "hype" && emoji.name === source.name;
    case "team":
      return emoji.id === `team:${source.team}`;
    case "medal":
      return emoji.id === `milestone:${medalKeyOf(source.tier)}`;
  }
}

function hypeOf({ unlocked: { hype } }: Turned): EmojiSource[] {
  return hype === null ? [] : [{ kind: "hype", name: hype.name }];
}

function hypeBeatOf(turned: Turned): FollowUp[] {
  return hypeOf(turned).map((source) => (_clock, steps) => steps.sendTheEmojiUp(source));
}

function teamUnlockOf(team: string): FollowUp {
  return async (clock, steps) => {
    await clock.sleep(turnTiming.unlockAfterMs);
    if (!steps.sealInView(team)) await fadeToAnotherPage(clock, steps, () => steps.goToTheTeam(team), () => steps.jumpToTheSeal(team));
    steps.stage("unlock");
    await steps.unlockTheTeam(team);
    await Promise.all([clock.sleep(turnTiming.unlockHoldMs), steps.sendTheEmojiUp({ kind: "team", team })]);
    steps.endTheUnlock();
  };
}

function milestoneBeatsOf({ milestones }: Turned["unlocked"]): FollowUp[] {
  return milestones.map(({ xp = 0, ...tier }) => medalBeatOf(tier, xp));
}

export function medalXpOwedIn({ unlocked: { milestones } }: Turned) {
  return milestones.reduce((sum, { xp = 0 }) => sum + xp, 0);
}

function medalBeatOf(tier: ReachedTier, xp: number): FollowUp {
  return async (clock, steps) => {
    await clock.sleep(turnTiming.medalAfterMs);
    steps.medalComing(tier);
    if (!steps.medalInView(tier)) await fadeToAnotherPage(clock, steps, steps.goToTheMilestones, () => steps.jumpToTheMedal(tier));
    steps.stage("medal");
    await steps.showTheMedal(tier, xp);
    await clock.sleep(turnTiming.medalHoldMs);
    await steps.stampTheMedal(tier);
    await Promise.all([steps.sendTheEmojiUp({ kind: "medal", tier }), payAfterTheEmojiSprings(clock, steps, tier, xp)]);
    steps.endTheMedal();
  };
}

async function payAfterTheEmojiSprings(clock: TurnClock, steps: TurnSteps, tier: ReachedTier, xp: number) {
  await clock.sleep(turnTiming.medalXpAfterMs);
  await steps.payTheMedal(tier, xp);
}

async function fadeToAnotherPage(clock: TurnClock, steps: TurnSteps, goToThePage: () => void, jump: () => void) {
  steps.darken(true);
  await clock.sleep(turnTiming.darkMs);
  goToThePage();
  await clock.sleep(turnTiming.pageDrawnMs);
  jump();
  await clock.sleep(turnTiming.jumpMs);
  steps.darken(false);
  await clock.sleep(turnTiming.lightMs);
}

async function rest(clock: TurnClock, steps: TurnSteps) {
  steps.stage("rest");
  await clock.sleep(turnTiming.restMs);
  if (steps.nothingWaits()) return;
  steps.stage("back");
  await clock.sleep(turnTiming.backMs);
}
