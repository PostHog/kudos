import { v, type Infer } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { HugGivenEvent, KudosGivenEvent } from "../bus/events";
import { weekOf } from "../engine/allowance";
import { messageRefValidator } from "../engine/messageEvent";
import type { MemberId } from "../workspace/directory";
import { questStartOf } from "./start";
import type { WeekKey } from "./week";

export const recognitionFactValidator = v.object({
  source: v.union(v.literal("kudos"), v.literal("hug")),
  workspace: v.string(),
  giver: v.id("members"),
  people: v.array(v.id("members")),
  kudos: v.number(),
  message: messageRefValidator,
  day: v.string(),
  at: v.number(),
});

export type RecognitionFact = Infer<typeof recognitionFactValidator>;

export const questRecognitionValidator = v.object({ ...recognitionFactValidator.fields, key: v.string() });

export function factOfKudosGiven({ workspace, giver, awards, message, day, at }: KudosGivenEvent): RecognitionFact {
  return { source: "kudos", workspace, giver, people: [...new Set(awards.map(({ recipient }) => recipient))], kudos: awards.length, message, day, at };
}

export function factOfHugGiven({ workspace, giver, author, message, day, at }: HugGivenEvent): RecognitionFact {
  return { source: "hug", workspace, giver, people: author === undefined ? [] : [author], kudos: 0, message, day, at };
}

export async function recognize(ctx: MutationCtx, fact: RecognitionFact): Promise<boolean> {
  const start = await questStartOf(ctx, fact.giver);
  if (start === null || fact.at < start) return false;
  const key = keyOf(fact);
  if ((await recognitionKeyed(ctx, fact.giver, key)) !== null) return false;
  await ctx.db.insert("questRecognitions", { ...fact, key });
  return true;
}

export async function recognitionsOf(ctx: QueryCtx, giver: MemberId, week: WeekKey): Promise<RecognitionFact[]> {
  const { monday, sunday } = weekOf(week);
  const rows = await ctx.db
    .query("questRecognitions")
    .withIndex("by_giver_day", (q) => q.eq("giver", giver).gte("day", monday).lte("day", sunday))
    .collect();
  return rows.map(({ _id, _creationTime, key, ...fact }) => fact);
}

function keyOf({ source, message, people }: RecognitionFact): string {
  const where = `${source}:${message.conversation}:${message.message}`;
  return source === "kudos" ? `${where}:${people.toSorted().join(",")}` : where;
}

function recognitionKeyed(ctx: QueryCtx, giver: MemberId, key: string) {
  return ctx.db
    .query("questRecognitions")
    .withIndex("by_giver_key", (q) => q.eq("giver", giver).eq("key", key))
    .unique();
}
