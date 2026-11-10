// A pure module: nothing from Convex in its body.
import type { Doc, Id } from "../_generated/dataModel";
import { greeting } from "./helper";
export { greeting as hello } from "./helper";

export function line(member: Id<"members">, row: Doc<"members">): string {
  return `${greeting}, ${member}

${String(row)}`;
}
