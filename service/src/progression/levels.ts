export function levelOf(xp: number): number {
  let level = 1;
  while (xpToReach(level + 1) <= xp) level += 1;
  return level;
}

export function xpToReach(level: number): number {
  if (level <= 1) return 0;
  if (level === 2) return 20;
  return 50 * (level - 1) * (level - 2);
}

export const skillTreeLevel = 5;

export function skillPointsEarnedAt(level: number): number {
  return Math.max(0, level - skillTreeLevel + 1);
}
