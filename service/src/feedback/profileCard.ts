import type { AvatarShown } from "../album/hoggies/avatar.ts";
import { avatarText } from "./avatar.ts";
import type { Medal, ProfileCard } from "../profileCard/profileCard.ts";
import { asWritten } from "./groupCopy.ts";
import { medals } from "./medals.ts";
import { slashCommand } from "./naming.ts";
import type { Line } from "./segments.ts";

export type ShownCard = ProfileCard & { group: string | null } & AvatarShown;

export function renderProfileCard(user: string, { avatar, group, level, medals: shown }: ShownCard): Line[] {
  const name: Line = [{ text: "*" }, { mention: { kind: "person", user } }, { text: "*" }];
  const avatarLine: Line[] = avatar ? [[{ text: avatarText(avatar) }]] : [];
  const groupLine: Line[] = group === null ? [] : [[{ text: asWritten({ name: group }) }]];
  const levelLine: Line[] = level === null ? [] : [[{ text: `Level ${level}` }]];
  const medalLine: Line[] = shown.length === 0 ? [] : [[{ text: shown.map(medalText).join(" · ") }]];
  return [name, ...avatarLine, ...groupLine, ...levelLine, ...medalLine];
}

export function renderNotAMember(user: string): Line[] {
  return [[{ mention: { kind: "person", user } }, { text: " isn't an active member of this workspace." }]];
}

export function renderLookUpFailed(user: string): Line[] {
  return [[{ text: "I couldn't look up " }, { mention: { kind: "person", user } }, { text: " right now. Try again in a minute." }]];
}

export function renderProfileCardUsage(): Line[] {
  return [[{ text: `Type \`${slashCommand} @someone\` to see their profile card.` }]];
}

export function medalText({ tier, name }: Medal) {
  return `${medals[tier]} ${name}`;
}
