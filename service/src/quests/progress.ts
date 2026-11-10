import { z } from "zod";
import { zv } from "../values.ts";
import type { DayKey } from "../engine/allowance.ts";
import type { AwardId } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { PoolQuest, Recipient } from "./pool.ts";

export type QuestAward = { award: AwardId; recipient: MemberId; day: DayKey; at: number; saysWhy: boolean; lastThankedBefore: number | null };

export type CountedAward = Pick<QuestAward, "recipient" | "day">;

export const questProgressValidator = z.strictObject({ done: zv.number(), of: zv.number(), unit: z.union([z.literal("kudos"), z.literal("days"), z.literal("people")]) });

export type QuestProgress = z.infer<typeof questProgressValidator>;

export const movedQuestValidator = z.strictObject({ goal: z.string(), progress: questProgressValidator });

export type MovedQuest = z.infer<typeof movedQuestValidator>;

const progressUnits: Record<PoolQuest["progress"]["counts"], QuestProgress["unit"]> = { recognitions: "kudos", people: "people", days: "days", "people-in-a-day": "people" };

export function progressUnitOf({ progress: { counts } }: PoolQuest): QuestProgress["unit"] {
  return progressUnits[counts];
}

export type Moved = { name: string; from: number; to: number; of: number };

export type ProgressRead = { since: number; until: number; mostAwards: number };

export const notThankedForMs = 30 * 24 * 60 * 60 * 1000;

export function counts({ progress: { given } }: PoolQuest, award: QuestAward): boolean {
  return (award.saysWhy || !given.saysWhy) && isRecipient(given.to, award.lastThankedBefore, award.at);
}

export function questProgress({ progress: { counts, target } }: PoolQuest, counted: CountedAward[]): number {
  return Math.min(countedBy[counts](counted), target);
}

const countedBy: Record<PoolQuest["progress"]["counts"], (counted: CountedAward[]) => number> = {
  recognitions: (counted) => distinct(counted, ({ recipient, day }) => `${recipient}:${day}`),
  people: (counted) => distinct(counted, ({ recipient }) => recipient),
  days: (counted) => distinct(counted, ({ day }) => day),
  "people-in-a-day": (counted) => Math.max(0, ...[...new Set(counted.map(({ day }) => day))].map((day) => distinct(counted.filter((award) => award.day === day), ({ recipient }) => recipient))),
};

function distinct(counted: CountedAward[], key: (award: CountedAward) => string): number {
  return new Set(counted.map(key)).size;
}

export function isRecipient(to: Recipient, lastThanked: number | null, at: number): boolean {
  switch (to) {
    case "anyone":
      return true;
    case "someone-new":
      return lastThanked === null;
    case "someone-not-thanked-in-30-days":
      return lastThanked === null || lastThanked <= at - notThankedForMs;
  }
}
