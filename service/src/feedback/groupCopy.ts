import type { GroupRef } from "../groups/groups.ts";

export const pickQuestion = "Which group do you count for on the leaderboard?";

export function countsFor(group: Pick<GroupRef, "name">) {
  return `You count for ${asWritten(group)} on the leaderboard.`;
}

export function noLongerYours(group: Pick<GroupRef, "name">) {
  return `${asWritten(group)} isn't one of your groups anymore. Pick another one.`;
}

export function asWritten({ name }: Pick<GroupRef, "name">) {
  return name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
