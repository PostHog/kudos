import { catalogue as hoggieCatalogue } from "./hoggies/catalogue.ts";
import type { MilestoneId, MilestoneTier } from "./records.ts";

export type { MilestoneId };

export type Step = { tier: MilestoneTier; at: number; name: string };

type Steps = readonly [Step, Step, Step, Step];

const companyTeamsDiamond = 50;

export const milestoneCatalogue = {
  version: 1,
  milestones: [
    { id: "people", steps: stepsOf([1, 10, 25, 50], ["First face", "Familiar faces", "Full of friends", "Everyone's album"]) },
    { id: "teams", steps: stepsOf([1, 5, 15, companyTeamsDiamond], ["First full page", "Five teams strong", "Most of the company", "Every page"]) },
    { id: "reach", steps: stepsOf([3, 10, 25, companyTeamsDiamond], ["Next door", "Bridge builder", "Well travelled", "All hands"]) },
    { id: "hoggies", steps: stepsOf([10, 40, 100, hoggieCatalogue.hoggies.length], ["Curious", "Collector", "Hoarder", "Completionist"]) },
    { id: "thoughtful", steps: stepsOf([1, 25, 100, 500], ["First thank-you", "Generous soul", "Heart of the team", "Patron of praise"]) },
  ],
} as const satisfies { version: number; milestones: readonly { id: MilestoneId; steps: Steps }[] };

export function stepNameOf(milestone: MilestoneId, tier: MilestoneTier): string {
  return milestoneCatalogue.milestones.find(({ id }) => id === milestone)!.steps.find((step) => step.tier === tier)!.name;
}

function stepsOf([bronze, silver, gold, diamond]: [number, number, number, number], [first, second, third, fourth]: [string, string, string, string]): Steps {
  return [
    { tier: "bronze", at: bronze, name: first },
    { tier: "silver", at: silver, name: second },
    { tier: "gold", at: gold, name: third },
    { tier: "diamond", at: diamond, name: fourth },
  ];
}
