// The module map's skeleton of convex/engine/home.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import { type WeekTotals } from "./awards.ts";
import { type LifetimeTotals } from "./totals.ts";
import { z } from "zod";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type KudosHome = { left: number; base: number; kudosEmoji: string; refillsAt: number } & WeekTotals & LifetimeTotals;

export type HomeFacts = ({ kind: "member" } & KudosHome) | { kind: "not-a-member" };

export const homeOfArgs = z.strictObject({ workspace: z.string(), user: z.string() });
export async function homeOf(ctx: QueryContext, args: z.infer<typeof homeOfArgs>): Promise<null | { kind: "member" } & { left: number; base: number; kudosEmoji: string; refillsAt: number } & import("./awards.ts").WeekTotals & import("./totals.ts").LifetimeTotals | { kind: "not-a-member" }> {
  throw notPorted("engine.home.homeOf");
}

export async function homeFacts(ctx: QueryContext, workspace: string, user: string): Promise<HomeFacts | null> {
  throw notPorted("engine.home.homeFacts");
}

export async function kudosHomeOf(ctx: QueryContext, workspace: string, member: MemberId, timeZone: string | undefined): Promise<KudosHome> {
  throw notPorted("engine.home.kudosHomeOf");
}
