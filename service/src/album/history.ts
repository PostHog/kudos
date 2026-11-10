// The module map's skeleton of convex/album/history.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const awardsPerHistoryPage = 50;
export const hugPeoplePerHistoryPage = 50;

export const recordAlbumHistoryArgs = z.strictObject({ workspace: z.string() });
export async function recordAlbumHistory(ctx: MutationContext, args: z.infer<typeof recordAlbumHistoryArgs>): Promise<null> {
  throw notPorted("album.history.recordAlbumHistory");
}
export const recordAlbumHistoryJob = mutationJob("album.history.recordAlbumHistory", recordAlbumHistoryArgs, recordAlbumHistory);
