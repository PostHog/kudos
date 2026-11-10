import type { Avatar } from "../album/hoggies/avatar.ts";
import { rarityLabel } from "../album/hoggies/catalogue.ts";

export function avatarText(avatar: Avatar) {
  return `Avatar: ${hoggieLabel(avatar)}`;
}

export function hoggieLabel({ name, rarity }: Avatar) {
  return `${name} (${rarityLabel(rarity)})`;
}
