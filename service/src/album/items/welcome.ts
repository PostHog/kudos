// The module map's skeleton of convex/album/items/welcome.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { memberGreetedEventValidator } from "../../bus/events.ts";
import type { CrateKey } from "../hoggies/crateKey.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { DmLinks } from "../../feedback/dmLinks.ts";
import { type WaitingCount } from "./ledger.ts";
import type { Turned } from "./turn.ts";
import { z } from "zod";
import type { Id } from "../../db/columns.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";
import { mutationJob } from "../../jobs/define.ts";

export type LoopLesson = { kudosEmoji: string; kudosEmojiImage: string | null };

export type Taught = { teaches?: LoopLesson };

export const welcomeCrateKey: CrateKey = "welcome:first";

export const earnWelcomeItemOnGreetingArgs = z.strictObject({ event: memberGreetedEventValidator });
export async function earnWelcomeItemOnGreeting(ctx: MutationContext, args: z.infer<typeof earnWelcomeItemOnGreetingArgs>): Promise<void> {
  throw notPorted("album.items.welcome.earnWelcomeItemOnGreeting");
}
export const earnWelcomeItemOnGreetingJob = mutationJob("album.items.welcome.earnWelcomeItemOnGreeting", earnWelcomeItemOnGreetingArgs, earnWelcomeItemOnGreeting);

export async function welcomeItemOwedTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.items.welcome.welcomeItemOwedTo");
}

export async function shownWaitingHoggiesAtTheWelcomeOf(ctx: QueryContext, member: MemberId, links: DmLinks | null, owedAtTheWelcome: boolean): Promise<WaitingCount> {
  throw notPorted("album.items.welcome.shownWaitingHoggiesAtTheWelcomeOf");
}

export async function lessonAfter(ctx: QueryContext, owner: { workspace: string; member: MemberId }, item: Id<"items">, { again }: Turned): Promise<Taught> {
  throw notPorted("album.items.welcome.lessonAfter");
}

export async function loopLessonIn(ctx: QueryContext, workspace: string): Promise<LoopLesson> {
  throw notPorted("album.items.welcome.loopLessonIn");
}
