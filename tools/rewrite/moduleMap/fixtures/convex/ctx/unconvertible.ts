import { v, type GenericValidator } from "convex/values";

const anything = v.any();
export const kindOf = v.string().kind;
export const vee = typeof v;
export { anything };
export const optional = (validator: GenericValidator) => validator.isOptional;
export type Fields = typeof anything.fields;

