// A validator module of the kinds today's convex/ declares: every validator, the type helpers, and reads of
// `.fields` and `.members` that the type checker tells apart from a plain object's.
import { v, type Infer, type ObjectType, type PropertyValidators } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { messageRefValidator, toneValidator } from "./shared";

function domainEvent<Fields extends PropertyValidators>(fields: Fields) {
  return v.object({ ...fields, fact: v.optional(v.string()) });
}

export const cheerEventValidator = domainEvent({
  type: v.literal("cheer"),
  member: v.id("members"),
  message: messageRefValidator,
  tones: v.array(toneValidator),
  score: v.number(),
  count: v.int64(),
  seen: v.boolean(),
  note: v.union(v.string(), v.null()),
  tallies: v.record(v.string(), v.union(v.number(), v.record(v.string(), v.boolean()))),
});
export type CheerEvent = Infer<typeof cheerEventValidator>;
export type CheerShape = typeof cheerEventValidator.type;

export const loudnessValidator = v.union(...toneValidator.members, v.literal("quiet"), v.literal(2), v.literal(3n), v.literal(false));
export const tones: readonly string[] = toneValidator.members.map(({ value }) => value);
export const nothingValidator = v.union();

const refArgs = { ...messageRefValidator.fields, member: v.id("members") };
export const refValidator = v.object(refArgs);
export type RefArgs = ObjectType<typeof refArgs>;
export const loudRefValidator = refValidator.extend({ tone: toneValidator }).omit("ts", "revision");
export const channelOnlyValidator = messageRefValidator.pick("channel");

/** A plain object with a `fields` property keeps it. */
export function fieldCount(line: { fields: string[]; members: number }, member: Id<"members">, row?: Doc<"members">): number {
  return line.fields.length + line.members + member.length + (row ? 1 : 0);
}
