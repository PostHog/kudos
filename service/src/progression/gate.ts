import { z } from "zod";
import { zv } from "../values.ts";
import type { Annotations } from "../engine/messageEvent.ts";
import type { ParseHook } from "../parser/parser.ts";

const ruleVersion = 1;
const wordsToBeThoughtful = 5;

export const gateDecisionValidator = z.strictObject({ version: zv.number(), thoughtful: z.boolean() });

export type GateDecision = z.infer<typeof gateDecisionValidator>;

export const thoughtfulKudos: ParseHook = {
  name: "thoughtful kudos",
  annotate: ({ text }) => {
    const words = wordsIn(text);
    return { gate: { version: ruleVersion, thoughtful: words >= wordsToBeThoughtful, words } };
  },
};

export function gateDecisionOf(annotations: Annotations): GateDecision | null {
  const gate = annotations.gate;
  if (typeof gate !== "object" || typeof gate.version !== "number" || typeof gate.thoughtful !== "boolean") return null;
  return { version: gate.version, thoughtful: gate.thoughtful };
}

export function saysWhy(annotations: Annotations): boolean {
  return gateDecisionOf(annotations)?.thoughtful === true;
}

export function wordCountOf(annotations: Annotations): number | null {
  const gate = annotations.gate;
  if (typeof gate !== "object" || typeof gate.words !== "number") return null;
  return gate.words;
}

function wordsIn(text: string) {
  return text.split(/\s+/).filter((run) => /[\p{L}\p{N}]/u.test(run)).length;
}
