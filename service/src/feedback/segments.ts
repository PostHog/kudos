import { z } from "zod";
import { mentionValidator } from "../engine/messageEvent.ts";

export const segmentValidator = z.union([z.strictObject({ text: z.string() }), z.strictObject({ mention: mentionValidator }), z.strictObject({ link: z.strictObject({ url: z.string(), label: z.string() }) })]);

export type Segment = z.infer<typeof segmentValidator>;
export type Line = Segment[];
