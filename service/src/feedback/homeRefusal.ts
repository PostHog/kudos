import { z } from "zod";
import { crateRefusalValidator } from "../album/hoggies/records.ts";
import { itemRefusalValidator } from "../store/rows.ts";

export const homeRefusalValidator = z.union([itemRefusalValidator, crateRefusalValidator]);

export type HomeRefusal = z.infer<typeof homeRefusalValidator>;
