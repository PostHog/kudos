import { v, type GenericValidator } from "convex/values";

const anything = v.any();
export const kindOf = v.string().kind;
export const vee = typeof v;
export { anything };
export const optional = (validator: GenericValidator) => validator.isOptional;
export type Fields = typeof anything.fields;
export const byMember = v.record(v.id("members"), v.string());
export const { kind } = v.object({ a: v.string() });
export const elementRead = v.object({ a: v.string() })["fields"];
export type FieldsType = (typeof anything)["kind"];
const keys = { string: () => v.union(v.literal("a"), v.literal("b")) };
export const finiteKeys = v.record(keys.string(), v.boolean());
