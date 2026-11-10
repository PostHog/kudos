import { z } from "zod";
import { perkValidator } from "./tree.ts";

export const refusalValidator = z.union([
  z.literal("tree-locked"),
  z.literal("tree-ready"),
  z.literal("owned"),
  z.literal("retired"),
  z.literal("below-row"),
  z.literal("needs-prerequisite"),
  z.literal("no-skill-points"),
  z.literal("coins-not-open"),
  z.literal("no-coins"),]
);

export type Refusal = z.infer<typeof refusalValidator>;

export const purchaseOutcomeValidator = z.union([
  z.strictObject({ kind: z.literal("bought"), perk: perkValidator }),
  z.strictObject({ kind: z.literal("refused"), perk: perkValidator, reason: refusalValidator }),]
);

export type PurchaseOutcome = z.infer<typeof purchaseOutcomeValidator>;
