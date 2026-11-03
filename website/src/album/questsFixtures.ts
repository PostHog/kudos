import type { DrawnQuest, GettingStartedStep, MondayQuests, SideQuest } from "../../../convex/website/quests";
import type { QuestsRead, QuestsShown } from "./answer";

const once = { done: 0, target: 1 };

const finishedOnce = { done: 1, target: 1 };

function newcomerJourney(): GettingStartedStep[] {
  return [
    { step: "hug", goal: "Give your first hug", hint: "React with your kudos emoji on any message in Slack.", progress: finishedOnce, done: true, reward: null, item: null },
    { step: "first-thanks", goal: "Give a kudos to someone", hint: "Mention someone in a Slack message and add your kudos emoji.", progress: once, done: false, reward: { xp: 50 }, item: null },
    { step: "turn", goal: "Identify the hoggie it left on your board", hint: null, progress: once, done: false, reward: null, item: null },
    { step: "someone-new", goal: "Thank someone new", hint: "Someone from another team counts, and so does a new joiner.", progress: once, done: false, reward: { xp: 50 }, item: null },
    { step: "two-days", goal: "Thank someone on two different days", hint: "One kudos today and another on any later day.", progress: { done: 0, target: 2 }, done: false, reward: { xp: 50 }, item: null },
  ];
}

function beforeTheFirstHugJourney(): GettingStartedStep[] {
  const [hug, ...rest] = newcomerJourney();
  return [{ ...hug!, progress: once, done: false }, ...rest];
}

function firstThanksJourney(): GettingStartedStep[] {
  const [hug, firstThanks, ...rest] = newcomerJourney();
  return [hug!, { ...firstThanks!, progress: finishedOnce, done: true, item: "waiting" }, ...rest];
}

function halfwayJourney(): GettingStartedStep[] {
  const [hug, firstThanks, turn, someoneNew, twoDays] = newcomerJourney();
  return [hug!, { ...firstThanks!, progress: finishedOnce, done: true, item: "turned" }, { ...turn!, progress: finishedOnce, done: true }, someoneNew!, { ...twoDays!, progress: { done: 1, target: 2 } }];
}

function awaitingTheDrawJourney(): GettingStartedStep[] {
  const [hug, firstThanks, turn, someoneNew, twoDays] = firstThanksJourney();
  return [hug!, firstThanks!, turn!, { ...someoneNew!, progress: finishedOnce, done: true, item: "waiting" }, { ...twoDays!, progress: { done: 2, target: 2 }, done: true, item: "waiting" }];
}

function drawnWeek(): DrawnQuest[] {
  return [
    { quest: "three-in-a-day", goal: "Thank 3 people in one day", progress: { done: 2, target: 3 }, done: false, reward: { xp: 20 }, item: null },
    { quest: "two-new", goal: "Thank 2 people you haven't thanked before", progress: { done: 0, target: 2 }, done: false, reward: { xp: 20 }, item: null },
    { quest: "not-in-30-days", goal: "Thank someone you haven't thanked in the last 30 days", progress: finishedOnce, done: true, reward: { xp: 20 }, item: "waiting" },
  ];
}

const hugHint = "React with your kudos emoji on any message in Slack.";

function newcomerSides(): SideQuest[] {
  return [
    { side: "hug", goal: "Give 3 hugs", hint: hugHint, progress: { done: 1, target: 3 }, done: false, reward: { xp: 20 }, item: null, next: true, drawn: false },
    { side: "kudos", goal: "Thank someone new", hint: "Someone from another team counts, and so does a new joiner.", progress: once, done: false, reward: { xp: 50 }, item: null, next: false, drawn: false },
  ];
}

function drawnSides(): SideQuest[] {
  return [
    { side: "hug", goal: "Hug messages on 2 different days", hint: hugHint, progress: { done: 2, target: 2 }, done: true, reward: { xp: 20 }, item: "waiting", next: false, drawn: true },
    { side: "kudos", goal: "Thank 3 people in one day", hint: null, progress: { done: 1, target: 3 }, done: false, reward: { xp: 20 }, item: null, next: true, drawn: true },
  ];
}

export const questsFixtures = {
  beforeTheFirstHug: { kind: "monday", firstName: "Sam", next: "first-thanks", daysLeft: 5, quests: { kind: "journey", steps: beforeTheFirstHugJourney() } },
  newcomer: { kind: "monday", firstName: "Sam", next: "first-thanks", daysLeft: 5, quests: { kind: "journey", steps: newcomerJourney() } },
  firstThanks: { kind: "monday", firstName: "Sam", next: "someone-new", daysLeft: 5, quests: { kind: "journey", steps: firstThanksJourney() } },
  halfway: { kind: "monday", firstName: "Sam", next: "someone-new", daysLeft: 5, quests: { kind: "journey", steps: halfwayJourney() } },
  awaitingTheDraw: { kind: "monday", firstName: "Sam", next: null, daysLeft: 5, quests: { kind: "journey", steps: awaitingTheDrawJourney() } },
  week: { kind: "monday", firstName: "Sam", next: null, daysLeft: 3, quests: { kind: "drawn", quests: drawnWeek() } },
  twoQuestsNewcomer: { kind: "monday", firstName: "Sam", next: "someone-new", daysLeft: 5, quests: { kind: "two-quests", quests: newcomerSides() } },
  twoQuestsDrawn: { kind: "monday", firstName: "Sam", next: null, daysLeft: 3, quests: { kind: "two-quests", quests: drawnSides() } },
  twoQuestsNone: { kind: "monday", firstName: "Sam", next: null, daysLeft: 5, quests: { kind: "two-quests", quests: [] } },
  twoQuestsOneSide: { kind: "monday", firstName: "Sam", next: null, daysLeft: 5, quests: { kind: "two-quests", quests: newcomerSides().slice(0, 1) } },
} as const satisfies Record<string, MondayQuests>;

export const noQuests: QuestsRead = (asking) => (asking ? { kind: "not-found" } : undefined);

export function fixedQuests(quests: QuestsShown): QuestsRead {
  return (asking) => (asking ? quests : undefined);
}
