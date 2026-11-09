// Convex reached without an import declaration: an import type and a dynamic import.
export type Callee = import("convex/server").FunctionReference<"query">;

export async function later(): Promise<unknown> {
  return import("../_generated/api");
}
