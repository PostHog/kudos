import { placesClimbed, type Entry } from "./board.ts";

export type Improvement = { gain: number; places?: number } | { best: number };

export function improvement(now: Entry[], before: Entry[], viewer: string, best: number | null): Improvement | null {
  const gain = givenBy(now, viewer) - givenBy(before, viewer);
  if (gain > 0) return { gain, ...placesOf(now, before, viewer) };
  return best === null ? null : { best };
}

function placesOf(now: Entry[], before: Entry[], viewer: string) {
  const places = placesClimbed(now, before).get(viewer);
  return places === undefined ? {} : { places };
}

function givenBy(entries: Entry[], viewer: string) {
  return entries.find((entry) => entry.id === viewer)?.value ?? 0;
}
