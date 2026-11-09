import type { FunctionReference } from "convex/server";
import { v } from "convex/values";

type Target = FunctionReference<"mutation">;
export type Plan = { target: Target; at: number };

export const kindValidator = v.string();
export type Kind = typeof kindValidator.kind;
