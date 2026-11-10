export function drawRank(key: string): number {
  let hash = 0x811c9dc5;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
  return hash;
}
