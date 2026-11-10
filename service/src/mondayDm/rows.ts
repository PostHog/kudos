// The module map's skeleton of convex/mondayDm/rows.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DayKey } from "../engine/allowance.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Doc } from "../db/schema/index.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type MondayDmRow = Doc<"mondayDms">;

export function mondayDmOf(ctx: QueryContext, member: MemberId, monday: DayKey): Promise<MondayDmRow | null> {
  throw notPorted("mondayDm.rows.mondayDmOf");
}
