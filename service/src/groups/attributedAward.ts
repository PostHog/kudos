import { z } from "zod";
import { zv } from "../values.ts";
import { awardIdValidator } from "../engine/awards.ts";

export const groupOrNoneValidator = z.union([zv.id("userGroups"), z.null()]);

export const attributedAwardValidator = z.strictObject({ award: awardIdValidator, recipient: zv.id("members"), kudos: zv.number(), saysWhy: z.boolean(), recipientGroup: groupOrNoneValidator });
