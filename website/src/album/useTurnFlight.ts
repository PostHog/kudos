import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { ReachedTier } from "../../../convex/album/milestones";
import type { TurnedFaceShown } from "../../../convex/website/album";
import type { AlbumEmoji } from "./answer";
import { bumpTheEmojiButton, emojiFlightTiming, flightEasing, flightFrames, springEasing, springFrames, theEmojiButton } from "./emojiFlight";
import { medalKeyOf } from "./milestones";
import { playTurn, turnClock, turnTiming, type EmojiSource, type FlightStage, type TurnClock, type Turned, type TurnSteps } from "./turnSequence";

export type Point = { x: number; y: number };

export type Flight = { item: string; from: DOMRect; stage: FlightStage; dark: boolean; face: TurnedFaceShown | null; spot: Point; size: number; burst: boolean; caption: boolean; chip: Chip | null; rings: DOMRect | null; flourish: DOMRect | null; medal: MedalShow | null; medalXp: MedalXpChip | null; emoji: EmojiUp | null };

export type EmojiUp = { emoji: AlbumEmoji; at: Point; flying: boolean };

export type MedalPhase = "in" | "down" | "stamped";

export type MedalShow = { tier: ReachedTier; xp: number; phase: MedalPhase; centre: Point; size: number; art: DOMRect };

export type MedalXpChip = { xp: number; tier: ReachedTier; from: Point; to: Point };

export type Chip = { xp: number; from: Point; to: Point };

export type FlightBoxes = { flyer: RefObject<HTMLDivElement | null>; flip: RefObject<HTMLDivElement | null>; disc: RefObject<HTMLSpanElement | null>; emoji: RefObject<HTMLSpanElement | null>; medal: RefObject<HTMLSpanElement | null> };

export type Arrival = { land: (turned: Turned) => void; landed: () => void; landedWithoutTheFlight: () => void; teamUnlocked: () => void; toTheTeam: (team: string) => void; toTheMilestones: () => void; medalComing: (tier: ReachedTier) => void; medalShown: () => void; medalSettled: () => void; paid: (xp: number) => void; nothingWaits: () => boolean; emojiOf: (source: EmojiSource) => AlbumEmoji | undefined; emojiHome: (id: string) => void };

type FaceKind = TurnedFaceShown["kind"];

type Change = (patch: Partial<Flight> | ((flying: Flight) => Partial<Flight>)) => void;

export function useTurnFlight() {
  const [flight, setFlight] = useState<Flight | null>(null);
  const boxes: FlightBoxes = { flyer: useRef<HTMLDivElement>(null), flip: useRef<HTMLDivElement>(null), disc: useRef<HTMLSpanElement>(null), emoji: useRef<HTMLSpanElement>(null), medal: useRef<HTMLSpanElement>(null) };
  const clock = useRef<TurnClock | null>(null);
  useSkipWhileFlying(flight !== null, clock);
  useSkipOnceGone(clock);
  const { flyer, flip, disc, emoji, medal } = boxes;
  const fly = useCallback(
    async (item: string, from: DOMRect, answer: Promise<Turned | null>, arrival: Arrival) => {
      const running = turnClock();
      clock.current = running;
      const { spot, size } = middleFor(from);
      setFlight({ item, from, stage: "lift", dark: false, face: null, spot, size, burst: false, caption: false, chip: null, rings: null, flourish: null, medal: null, medalXp: null, emoji: null });
      const change: Change = (patch) => setFlight((flying) => (flying === null ? null : { ...flying, ...(typeof patch === "function" ? patch(flying) : patch) }));
      const turned = await playTurn(running, stepsOf(running, { flyer, flip, disc, emoji, medal }, change, arrival, { from, spot, size }), answer);
      clock.current = null;
      setFlight(null);
      return turned;
    },
    [flyer, flip, disc, emoji, medal],
  );
  return { flight, boxes, fly, flying: flight !== null };
}

function useSkipWhileFlying(flying: boolean, clock: RefObject<TurnClock | null>) {
  useEffect(() => {
    if (!flying) return;
    const skip = () => clock.current?.skip();
    const onKey = (event: KeyboardEvent) => {
      if (!skipKeys.has(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      skip();
    };
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", skip, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [flying, clock]);
}

function useSkipOnceGone(clock: RefObject<TurnClock | null>) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) clock.current?.stop();
      });
    };
  }, [clock]);
}

const skipKeys = new Set(["Enter", " ", "Escape"]);

type Start = { from: DOMRect; spot: Point; size: number };

function stepsOf(clock: TurnClock, boxes: FlightBoxes, change: Change, arrival: Arrival, start: Start): TurnSteps {
  const motion = flyerMotion(clock, boxes, start);
  let kind: FaceKind = "hoggie";
  return {
    stage: (stage) => change({ stage }),
    darken: (dark) => change({ dark }),
    lift: () => motion.moveTo(start.spot, start.size / Math.max(1, start.from.width), turnTiming.liftMs, liftEasing, 40),
    goToThePage(turned) {
      kind = turned.face.kind;
      flushSync(() => {
        change({ face: turned.face });
        arrival.land(turned);
      });
      scrollToTheTop();
    },
    flip: () => clock.animate(boxes.flip.current, flipFrames, { duration: turnTiming.flipMs, easing: "cubic-bezier(0.45, 0, 0.2, 1)" }),
    burst: () => change({ burst: true }),
    caption: () => change({ caption: true }),
    payTheXp: (xp) => payTheXp(clock, change, arrival, start, xp),
    slotDrawn: () => theSlot() !== null,
    slotInView: () => inView(theSlot()),
    jumpToTheSlot: () => jumpTo(theSlot()),
    aboveTheSlot: () => motion.aboveTheSlot(),
    dropIntoTheSlot: () => motion.dropIntoTheSlot(kind),
    landed() {
      arrival.landed();
      const target = theTarget();
      change({ burst: false, caption: false, rings: target?.getBoundingClientRect() ?? null });
      target?.animate?.(slotPopFrames, { duration: turnTiming.popMs, easing: "ease-out" });
    },
    landWithoutTheFlight: arrival.landedWithoutTheFlight,
    squash: () => motion.squash(),
    sealInView: (team) => isInView(theSealSpot(team)),
    goToTheTeam(team) {
      if (theSealSpot(team) === null) arrival.toTheTeam(team);
    },
    jumpToTheSeal: (team) => jumpTo(theSealSpot(team)),
    async unlockTheTeam(team) {
      arrival.teamUnlocked();
      const seal = document.querySelector<HTMLElement>(`main [data-al-seal="${team}"]`);
      change({ flourish: seal?.getBoundingClientRect() ?? null });
      await clock.animate(seal, sealPopFrames, { duration: turnTiming.sealPopMs, easing: "cubic-bezier(0.3, 0.8, 0.3, 1)" });
      seal?.getAnimations?.().forEach((animation) => animation.cancel());
    },
    endTheUnlock: () => change({ flourish: null }),
    medalComing: (tier) => flushSync(() => arrival.medalComing(tier)),
    medalInView: (tier) => isInView(theMedal(tier)),
    goToTheMilestones: arrival.toTheMilestones,
    jumpToTheMedal: (tier) => jumpTo(theMedal(tier)),
    showTheMedal: (tier, xp) => showTheMedal(clock, boxes, change, tier, xp),
    stampTheMedal: (tier) => stampTheMedal(clock, boxes, change, arrival, tier),
    payTheMedal: (tier, xp) => payTheMedal(clock, change, arrival, tier, xp),
    endTheMedal() {
      change({ medal: null, medalXp: null });
      arrival.medalSettled();
    },
    sendTheEmojiUp: (source) => sendTheEmojiUp(clock, boxes, change, arrival, source),
    nothingWaits: arrival.nothingWaits,
  };
}

async function showTheMedal(clock: TurnClock, boxes: FlightBoxes, change: Change, tier: ReachedTier, xp: number) {
  const size = Math.round(Math.min(220, Math.min(window.innerWidth, window.innerHeight) * 0.3));
  const centre = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  flushSync(() => change({ medal: { tier, xp, phase: "in", centre, size, art: rectOf(theMedalArt(tier)) } }));
  await clock.animate(boxes.medal.current, medalInFrames, { duration: turnTiming.medalInMs, easing: "cubic-bezier(0.25, 0.8, 0.3, 1)" });
}

async function stampTheMedal(clock: TurnClock, boxes: FlightBoxes, change: Change, arrival: Arrival, tier: ReachedTier) {
  const art = theMedalArt(tier);
  const big = boxes.medal.current;
  const to = rectOf(art);
  change(({ medal }) => ({ medal: medal === null ? null : { ...medal, phase: "down", art: to } }));
  await clock.animate(big, big === null ? [] : medalDownFrames(big.getBoundingClientRect(), to), { duration: turnTiming.medalDownMs, easing: "cubic-bezier(0.6, 0, 0.9, 0.5)" });
  flushSync(arrival.medalShown);
  const stamped = rectOf(theMedalArt(tier));
  change(({ medal }) => ({ medal: medal === null ? null : { ...medal, phase: "stamped", art: stamped } }));
  const medal = theMedal(tier);
  await Promise.all([clock.animate(medal?.querySelector(".al-ms-medal-art"), medalStampFrames, { duration: turnTiming.medalStampMs, easing: "cubic-bezier(0.3, 0.8, 0.3, 1)" }), clock.animate(medal?.querySelector(".al-ms-emoji"), emojiPopFrames, { duration: turnTiming.medalStampMs, easing: "ease-out" })]);
}

async function payTheMedal(clock: TurnClock, change: Change, arrival: Arrival, tier: ReachedTier, xp: number) {
  if (xp === 0) return;
  const art = rectOf(theMedalArt(tier));
  const bar = document.querySelector(".al-xp-track")?.getBoundingClientRect();
  const from = { x: art.left + art.width / 2, y: art.top + art.height / 2 };
  change({ medalXp: { xp, tier, from, to: bar === undefined ? from : { x: bar.left + bar.width * 0.8, y: bar.top + bar.height / 2 } } });
  await clock.sleep(turnTiming.medalXpMs);
  change({ medalXp: null });
  arrival.paid(xp);
  document.querySelector(".al-xp")?.animate?.(xpLandFrames, { duration: 620, easing: "cubic-bezier(0.3, 0.8, 0.3, 1)" });
}

async function sendTheEmojiUp(clock: TurnClock, boxes: FlightBoxes, change: Change, arrival: Arrival, source: EmojiSource) {
  const emoji = arrival.emojiOf(source);
  if (emoji === undefined) return;
  const up: EmojiUp = { emoji, at: centreOf(rectOf(emojiSpotOf(source))), flying: false };
  flushSync(() => change({ emoji: up }));
  const picture = boxes.emoji.current;
  await clock.animate(picture, springFrames, { duration: emojiFlightTiming.springMs, easing: springEasing });
  await clock.sleep(emojiFlightTiming.pauseMs);
  const button = theEmojiButton();
  change({ emoji: { ...up, flying: true } });
  await clock.animate(picture, picture === null || button === null ? [] : flightFrames(picture.getBoundingClientRect(), button.getBoundingClientRect()), { duration: emojiFlightTiming.flightMs, easing: flightEasing });
  change({ emoji: null });
  if (clock.isStopped()) return;
  arrival.emojiHome(emoji.id);
  bumpTheEmojiButton(button);
}

function emojiSpotOf(source: EmojiSource): Element | null {
  switch (source.kind) {
    case "hype":
      return document.querySelector(".ib-landed-hype") ?? theTarget();
    case "team":
      return document.querySelector(`main [data-al-seal="${CSS.escape(source.team)}"]`);
    case "medal":
      return theMedal(source.tier)?.querySelector(".al-ms-emoji") ?? theMedal(source.tier);
  }
}

function rectOf(element: Element | null | undefined) {
  return element?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
}

async function payTheXp(clock: TurnClock, change: Change, arrival: Arrival, { spot, size }: Start, xp: number) {
  if (xp === 0) return arrival.paid(0);
  await clock.sleep(turnTiming.chipAfterMs);
  const bar = document.querySelector(".al-xp-track")?.getBoundingClientRect();
  const from = { x: spot.x + size * 0.32, y: spot.y - size * 0.42 };
  change({ chip: { xp, from, to: bar === undefined ? from : { x: bar.left + bar.width * 0.8, y: bar.top + bar.height / 2 } } });
  await clock.sleep(turnTiming.chipFlightMs);
  change({ chip: null });
  arrival.paid(xp);
  document.querySelector(".al-xp")?.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
}

function flyerMotion(clock: TurnClock, boxes: FlightBoxes, { from }: Start) {
  const origin = centreOf(from);
  let here = origin;
  let scale = 1;
  let goal = origin;
  let endScale = 1;
  const at = (point: Point, size: number) => `translate(${point.x - origin.x}px, ${point.y - origin.y}px) scale(${size})`;
  const moveTo = async (point: Point, nextScale: number, duration: number, easing: string, lift = 0) => {
    const middle = { x: (here.x + point.x) / 2, y: Math.min(here.y, point.y) - lift };
    const frames = lift === 0 ? [{ transform: at(here, scale) }, { transform: at(point, nextScale) }] : [{ transform: at(here, scale) }, { transform: at(middle, (scale + nextScale) / 2 + 0.1), offset: 0.45 }, { transform: at(point, nextScale) }];
    here = point;
    scale = nextScale;
    await clock.animate(boxes.flyer.current, frames, { duration, easing });
  };
  return {
    moveTo,
    async aboveTheSlot() {
      const target = theTarget()?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2 - 40, window.innerHeight / 2 - 40, 80, 80);
      goal = centreOf(target);
      endScale = Math.max(0.2, Math.min(target.width, target.height) / Math.max(1, from.width));
      await moveTo({ x: goal.x, y: Math.max(140, goal.y - target.height * 0.5 - 60) }, 1.35, turnTiming.aboveMs, liftEasing, 40);
    },
    async dropIntoTheSlot(kind: FaceKind) {
      await Promise.all([moveTo(goal, endScale, turnTiming.dropMs, "cubic-bezier(0.7, 0, 1, 0.6)"), clock.animate(boxes.disc.current, discFramesFor(kind, theTarget()), { duration: turnTiming.fitMs, easing: "ease-in" })]);
    },
    squash: () => clock.animate(boxes.flyer.current, [{ transform: at(goal, endScale) }, { transform: `${at(goal, endScale)} scale(1.16, 0.84)`, offset: 0.35 }, { transform: at(goal, endScale), opacity: 0 }], { duration: turnTiming.squashMs, easing: "ease-out" }),
  };
}

function discFramesFor(kind: FaceKind, target: HTMLElement | null): Keyframe[] {
  if (kind === "hoggie") return [{ opacity: 1 }, { opacity: 0 }];
  const radius = target === null ? Number.NaN : parseFloat(getComputedStyle(target).borderRadius);
  const width = target?.getBoundingClientRect().width ?? 0;
  return [{ borderRadius: "50%" }, { borderRadius: Number.isNaN(radius) || width === 0 ? "50%" : `${(radius / width) * 100}%` }];
}

const liftEasing = "cubic-bezier(0.3, 0.8, 0.3, 1)";

const flipFrames: Keyframe[] = [{ transform: "rotateY(0deg)" }, { transform: "rotateY(205deg)", offset: 0.72 }, { transform: "rotateY(180deg)" }];

const slotPopFrames: Keyframe[] = [{ transform: "scale(1)" }, { transform: "scale(1.26)", offset: 0.3 }, { transform: "scale(0.93)", offset: 0.6 }, { transform: "scale(1.04)", offset: 0.82 }, { transform: "scale(1)" }];

const sealPopFrames: Keyframe[] = [{ transform: "scale(0.6) rotate(-14deg)", filter: "saturate(0)" }, { transform: "scale(1.28) rotate(6deg)", filter: "saturate(1.3)", offset: 0.45 }, { transform: "scale(0.96) rotate(-2deg)", offset: 0.75 }, { transform: "none", filter: "none" }];

const medalInFrames: Keyframe[] = [
  { transform: "scale(0.1) rotateY(-900deg)", filter: "grayscale(1) brightness(1.4)", opacity: 0 },
  { opacity: 1, offset: 0.15 },
  { transform: "scale(1.22) rotateY(-30deg)", filter: "grayscale(0) saturate(1.5) brightness(1.35)", offset: 0.62 },
  { transform: "scale(0.94) rotateY(8deg)", filter: "grayscale(0) saturate(1.2) brightness(1.1)", offset: 0.82 },
  { transform: "none", filter: "none", opacity: 1 },
];

const medalStampFrames: Keyframe[] = [{ transform: "scale(1.45)", filter: "brightness(1.6) saturate(1.4)" }, { transform: "scale(0.88)", offset: 0.35 }, { transform: "scale(1.08)", filter: "brightness(1.1)", offset: 0.65 }, { transform: "none", filter: "none" }];

const xpLandFrames: Keyframe[] = [{ transform: "scale(1)", filter: "none" }, { transform: "scale(1.14)", filter: "brightness(1.25) drop-shadow(0 0 10px var(--al-gold))", offset: 0.3 }, { transform: "scale(0.97)", offset: 0.65 }, { transform: "scale(1)", filter: "none" }];

function medalDownFrames(from: DOMRect, to: DOMRect): Keyframe[] {
  const x = to.left + to.width / 2 - (from.left + from.width / 2);
  const y = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = from.width === 0 || to.width === 0 ? 0.3 : to.width / from.width;
  return [{ transform: "none" }, { transform: `translate(${x * 0.25}px, ${y * 0.25 - 40}px) scale(${(1 + scale) / 1.6})`, offset: 0.35 }, { transform: `translate(${x}px, ${y}px) scale(${scale})` }];
}

const emojiPopFrames: Keyframe[] = [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(0)", opacity: 0, offset: 0.4 }, { transform: "scale(1.25)", opacity: 1, offset: 0.75 }, { transform: "none", opacity: 1 }];

function middleFor(from: DOMRect) {
  const big = Math.min(1.8, (Math.min(window.innerWidth, window.innerHeight) * 0.3) / Math.max(1, from.width));
  return { spot: { x: window.innerWidth / 2, y: window.innerHeight * 0.42 }, size: from.width * big };
}

function theSlot() {
  return document.querySelector<HTMLElement>("main [data-landed]");
}

function theTarget() {
  const slot = theSlot();
  return slot?.querySelector<HTMLElement>(".al-photo-sticker, .al-hoggies-plate-art") ?? slot;
}

function theMedal(tier: ReachedTier) {
  return document.querySelector<HTMLElement>(`main [data-al-medal="${medalKeyOf(tier)}"]`);
}

function theMedalArt(tier: ReachedTier) {
  return theMedal(tier)?.querySelector(".al-ms-medal-art");
}

function theSealSpot(team: string) {
  return document.querySelector<HTMLElement>(`main [data-al-seal="${team}"]`)?.closest<HTMLElement>(".al-seal-spot") ?? null;
}

function inView(element: HTMLElement | null) {
  if (element === null) return true;
  const { top, bottom } = element.getBoundingClientRect();
  return top > window.innerHeight * 0.15 && bottom < window.innerHeight * 0.8;
}

function isInView(element: HTMLElement | null) {
  return element !== null && inView(element);
}

function jumpTo(element: HTMLElement | null) {
  element?.scrollIntoView({ block: "center", behavior: "instant" });
}

function scrollToTheTop() {
  document.scrollingElement?.scrollTo?.({ top: 0, behavior: "instant" });
}

function centreOf(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
