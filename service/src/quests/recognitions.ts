// The module map's skeleton of convex/quests/recognitions.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { HugGivenEvent, KudosGivenEvent } from "../bus/events.ts";
import { messageRefValidator } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { WeekKey } from "./week.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

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

export async function recognize(ctx: MutationContext, fact: RecognitionFact): Promise<boolean> {
  throw notPorted("quests.recognitions.recognize");
}

export async function recognitionsOf(ctx: QueryContext, giver: MemberId, week: WeekKey): Promise<RecognitionFact[]> {
  throw notPorted("quests.recognitions.recognitionsOf");
}
