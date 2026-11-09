import { v } from "convex/values";

const anything = v.any();
export const kindOf = v.string().kind;
export const vee = typeof v;
export { anything };
