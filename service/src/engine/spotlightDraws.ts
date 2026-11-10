// The module map's skeleton of convex/engine/spotlightDraws.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MessageRef } from "./messageEvent.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type DrawPoint = { position: number; created: number };

export type Drawn = DrawPoint & { ref: MessageRef };

export type DrawWalk = { after: DrawPoint; through: DrawPoint };

export async function placeInSpotlight(ctx: MutationContext, ref: MessageRef, drawable: boolean): Promise<void> {
  throw notPorted("engine.spotlightDraws.placeInSpotlight");
}

export async function dropFromSpotlight(ctx: MutationContext, ref: MessageRef): Promise<void> {
  throw notPorted("engine.spotlightDraws.dropFromSpotlight");
}

export function beforeEveryDrawAt(position: number): DrawPoint {
  return { position, created: 0 };
}

export async function* drawnAlong(ctx: QueryContext, workspace: string, walk: DrawWalk): AsyncGenerator<Drawn> {
  throw notPorted("engine.spotlightDraws.drawnAlong");
}
