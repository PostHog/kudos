// What each giver has done toward their quests: one fact per kudos message or hug, recorded once, from their quest start.
// Today's convex/quests/recognitions.ts over the service's transaction.
import { and, eq, gte, lte } from "drizzle-orm";
import { weekOf } from "../engine/allowance.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { questRecognitions, type Doc } from "../db/schema/index.ts";
import { questStartOf } from "./start.ts";
import type { HugGivenEvent, KudosGivenEvent } from "../bus/events.ts";
import { messageRefValidator } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { WeekKey } from "./week.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { unique } from "../db/unique.ts";

export const recognitionFactValidator = z.strictObject({
  source: z.union([z.literal("kudos"), z.literal("hug")]),
  workspace: z.string(),
  giver: zv.id("members"),
  people: z.array(zv.id("members")),
  kudos: zv.number(),
  message: messageRefValidator,
  day: z.string(),
  at: zv.number(),
});

export type RecognitionFact = z.infer<typeof recognitionFactValidator>;

export const questRecognitionValidator = z.strictObject({ ...recognitionFactValidator.shape, key: z.string() });

export function factOfKudosGiven({ workspace, giver, awards, message, day, at }: KudosGivenEvent): RecognitionFact {
  return { source: "kudos", workspace, giver, people: [...new Set(awards.map(({ recipient }) => recipient))], kudos: awards.length, message, day, at };
}

export function factOfHugGiven({ workspace, giver, author, message, day, at }: HugGivenEvent): RecognitionFact {
  return { source: "hug", workspace, giver, people: author === undefined ? [] : [author], kudos: 0, message, day, at };
}

const byGiverKey = indexOrder(questRecognitions, ["giver", "key"]);
const byGiverDay = indexOrder(questRecognitions, ["giver", "day"]);

export async function recognize(ctx: MutationContext, fact: RecognitionFact): Promise<boolean> {
  const start = await questStartOf(ctx, fact.giver);
  if (start === null || fact.at < start) return false;
  const key = keyOf(fact);
  if (await isRecognized(ctx, fact.giver, key)) return false;
  await ctx.tx.insert(questRecognitions).values(fromDocument(questRecognitions, { ...ctx.newRow(), ...fact, key }) as typeof questRecognitions.$inferInsert);
  return true;
}

export async function recognitionsOf(ctx: QueryContext, giver: MemberId, week: WeekKey): Promise<RecognitionFact[]> {
  const { monday, sunday } = weekOf(week);
  const rows = await ctx.tx
    .select()
    .from(questRecognitions)
    .where(and(eq(questRecognitions.giver, giver), gte(questRecognitions.day, monday), lte(questRecognitions.day, sunday)))
    .orderBy(...byGiverDay.orderBy());
  return rows.map((row) => {
    const { _id, _creationTime, key, ...fact } = toDocument<Doc<"questRecognitions">>(questRecognitions, row);
    return fact;
  });
}

function keyOf({ source, message, people }: RecognitionFact): string {
  const where = `${source}:${message.conversation}:${message.message}`;
  return source === "kudos" ? `${where}:${people.toSorted().join(",")}` : where;
}

/** Whether the giver has a fact under this key; two fail, as `.unique()` did. */
async function isRecognized(ctx: QueryContext, giver: MemberId, key: string): Promise<boolean> {
  const rows = await ctx.tx
    .select({ _id: questRecognitions._id })
    .from(questRecognitions)
    .where(and(eq(questRecognitions.giver, giver), eq(questRecognitions.key, key)))
    .orderBy(...byGiverKey.orderBy())
    .limit(2);
  return unique("questRecognitions", rows) !== null;
}
