import { bonuses, tree } from "./tree.ts";

export const catalogue = {
  version: "2",
  baseXp: { giver: 10, recipient: 5 },
  coins: { giving: 4, receiving: 2, receivingGiversAWeek: 10 },
  tree,
  bonuses,
} as const;

export type Catalogue = typeof catalogue;
