// The welcome item: a greeted member who is owed it earns one face-down hoggie, and turning it teaches the kudos loop
// in the workspace's own kudos emoji. Today's convex/album/items/welcome.ts over the service's transaction.
import { memberGreetedEventValidator } from "../../bus/events.ts";
import type { CrateKey } from "../hoggies/crateKey.ts";
import { customEmojiImageOf } from "../../workspace/customEmoji.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { settingsOf } from "../../workspace/settings.ts";
import type { DmLinks } from "../../feedback/dmLinks.ts";
import { earnHoggieItem, welcomeRarities } from "../hoggies/rarityCaps.ts";
import { earnedItemOf, shownWaitingHoggiesOf, type WaitingCount } from "./ledger.ts";
import type { Turned } from "./turn.ts";
import { welcomeItemShownTo } from "./welcomeFlag.ts";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Id } from "../../db/columns.ts";
import { toDocument } from "../../db/documents.ts";
import { items, type Doc } from "../../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { mutationJob } from "../../jobs/define.ts";

export type LoopLesson = { kudosEmoji: string; kudosEmojiImage: string | null };

export type Taught = { teaches?: LoopLesson };

export const welcomeCrateKey: CrateKey = "welcome:first";

export const earnWelcomeItemOnGreetingArgs = z.strictObject({ event: memberGreetedEventValidator });
export async function earnWelcomeItemOnGreeting(ctx: MutationContext, { event: { workspace, member, owesTheWelcomeItem, at } }: z.infer<typeof earnWelcomeItemOnGreetingArgs>): Promise<void> {
  if (owesTheWelcomeItem) await earnHoggieItem(ctx, { workspace, member, key: welcomeCrateKey, reason: { kind: "welcome" }, earnedAt: at }, welcomeRarities);
}
export const earnWelcomeItemOnGreetingJob = mutationJob("album.items.welcome.earnWelcomeItemOnGreeting", earnWelcomeItemOnGreetingArgs, earnWelcomeItemOnGreeting);

export async function welcomeItemOwedTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await welcomeItemShownTo(ctx, member)) && !(await holdsTheWelcomeItem(ctx, member));
}

export async function shownWaitingHoggiesAtTheWelcomeOf(ctx: QueryContext, member: MemberId, links: DmLinks | null, owedAtTheWelcome: boolean): Promise<WaitingCount> {
  const notYetEarned = owedAtTheWelcome && !(await holdsTheWelcomeItem(ctx, member)) ? 1 : 0;
  return shownWaitingHoggiesOf(ctx, member, links, { notYetEarned });
}

async function holdsTheWelcomeItem(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await earnedItemOf(ctx, member, "hoggie", welcomeCrateKey)) !== null;
}

export async function lessonAfter(ctx: QueryContext, owner: { workspace: string; member: MemberId }, item: Id<"items">, { again }: Turned): Promise<Taught> {
  if (again || !(await isTheWelcomeItem(ctx, item)) || !(await welcomeItemShownTo(ctx, owner.member))) return {};
  return { teaches: await loopLessonIn(ctx, owner.workspace) };
}

async function isTheWelcomeItem(ctx: QueryContext, item: Id<"items">): Promise<boolean> {
  const [row] = await ctx.tx.select().from(items).where(eq(items._id, item));
  return row !== undefined && toDocument<Doc<"items">>(items, row).reason.kind === "welcome";
}

export async function loopLessonIn(ctx: QueryContext, workspace: string): Promise<LoopLesson> {
  const { kudosEmoji } = await settingsOf(ctx, workspace);
  return { kudosEmoji, kudosEmojiImage: (await customEmojiImageOf(ctx, workspace, kudosEmoji)) ?? null };
}
