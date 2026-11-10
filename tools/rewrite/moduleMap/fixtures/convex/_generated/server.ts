// Stands in for Convex's generated server, the same builders and contexts over the fixtures' data model.
import {
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type ActionBuilder,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server";
import type { DataModel } from "./dataModel";

export const internalQuery: QueryBuilder<DataModel, "internal"> = internalQueryGeneric;
export const internalMutation: MutationBuilder<DataModel, "internal"> = internalMutationGeneric;
export const internalAction: ActionBuilder<DataModel, "internal"> = internalActionGeneric;
export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
