import type { GroupImprovement } from "./groupsBoard.ts";
import type { Improvement } from "./improvement.ts";
import type { ComparedPeriod } from "./periods.ts";
import type { GivenMeasure } from "./totals.ts";

export function improvementLine(improvement: Improvement, period: ComparedPeriod, measure: GivenMeasure): string {
  if ("best" in improvement) return `Your best ${period} so far: ${givenCount(improvement.best, measure)}.`;
  return `▲ ${improvement.gain} more ${givenNoun(improvement.gain, measure)} than this time last ${period}${placesClimbedPart(improvement.places)}`;
}

export function givenCount(count: number, measure: GivenMeasure): string {
  return `${count} ${givenNoun(count, measure)}`;
}

function givenNoun(count: number, measure: GivenMeasure): string {
  if (measure === "kudosGiven") return "kudos";
  return count === 1 ? "hug" : "hugs";
}

export function groupImprovementLine(improvement: GroupImprovement, group: string, period: ComparedPeriod): string {
  if ("best" in improvement) return `${group}'s best ${period} so far: ${improvement.best.toFixed(1)} per person.`;
  return `▲ ${improvement.gain.toFixed(1)} more per person than this time last ${period}${placesClimbedPart(improvement.places)}`;
}

export function placesClimbedPart(places: number | undefined): string {
  if (places === undefined) return "";
  return ` · ▲ ${places} ${places === 1 ? "place" : "places"}`;
}
