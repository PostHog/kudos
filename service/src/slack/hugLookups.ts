// A hug whose giver or author the directory doesn't know yet: look them up in Slack, a few tries apart, then decide the
// reaction again. Today's convex/slack/hugLookups.ts.
import { hugReactionValidator } from "../hugs/reaction.ts";
import { decideReaction } from "../hugs/hugs.ts";
import { lookUpUser } from "./directory.ts";
import { verificationTries } from "./verifyMember.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";

const firstRetryMs = 1000;

const lookUpArgs = { reaction: hugReactionValidator, users: z.array(z.string()) };

type LookUpArgs = { reaction: z.infer<typeof hugReactionValidator>; users: string[] };

export const lookUpHugPeopleArgs = z.strictObject({ ...lookUpArgs, attempt: z.optional(zv.number()) });
export async function lookUpHugPeople(ctx: ActionContext, { reaction, users, attempt = 1 }: z.infer<typeof lookUpHugPeopleArgs>): Promise<void> {
  const stillUnknown: string[] = [];
  let retryAfterMs = 0;
  for (const user of users) {
    const answer = await lookUpUser(ctx, reaction.workspace, user);
    if (answer.kind === "failed") {
      stillUnknown.push(user);
      retryAfterMs = Math.max(retryAfterMs, answer.retryAfterMs ?? 0);
    }
  }
  if (stillUnknown.length === 0) await ctx.run.mutation("slack.hugLookups.decideLookedUpHug", (ctx) => decideLookedUpHug(ctx, { reaction }));
  else if (attempt < verificationTries) await tryAgainLater(ctx, { reaction, users: stillUnknown, attempt }, retryAfterMs);
}
export const lookUpHugPeopleJob = actionJob("slack.hugLookups.lookUpHugPeople", lookUpHugPeopleArgs, lookUpHugPeople);

async function tryAgainLater(ctx: ActionContext, { attempt, ...lookUp }: LookUpArgs & { attempt: number }, retryAfterMs: number) {
  const waitMs = Math.max(retryAfterMs, firstRetryMs * 2 ** (attempt - 1));
  await ctx.run.mutation(`${lookUpHugPeopleJob.name}.retry`, ({ jobs }) => jobs.enqueue(lookUpHugPeopleJob, { ...lookUp, attempt: attempt + 1 }, { after: waitMs }));
}

export const decideLookedUpHugArgs = z.strictObject({ reaction: hugReactionValidator });
export async function decideLookedUpHug(ctx: MutationContext, { reaction }: z.infer<typeof decideLookedUpHugArgs>): Promise<void> {
  await decideReaction(ctx, reaction);
}
