import { journeyStepValidator, type JourneyQuest, type Quest, type WeeklyQuest } from "./step.ts";

export function rewardKeyOf(quest: Quest): `${Quest["kind"]}:${string}` {
  switch (quest.kind) {
    case "journey":
      return `${rewardKeyPrefixOf("journey")}${quest.step}`;
    case "weekly":
      return `${rewardKeyPrefixOf("weekly")}${quest.week}:${quest.slot}`;
  }
}

export function weeklyQuestOfRewardKey(key: string): WeeklyQuest | null {
  const match = new RegExp(`^${rewardKeyPrefixOf("weekly")}(.+):(\\d+)$`).exec(key);
  return match === null ? null : { kind: "weekly", week: match[1]!, slot: Number(match[2]) };
}

export function journeyQuestOfRewardKey(key: string): JourneyQuest | null {
  const step = journeyStepValidator.options.map(({ value }) => value).find((candidate) => key === rewardKeyOf({ kind: "journey", step: candidate }));
  return step === undefined ? null : { kind: "journey", step };
}

function rewardKeyPrefixOf<K extends Quest["kind"]>(kind: K): `${K}:` {
  return `${kind}:`;
}
