// Pays a hug to its people: the author, or the recipients of the kudos it hugged, a page at a time, once each.
// Today's convex/hugs/people.ts; subscribes to `hugGiven`.
import { hugGivenEventValidator, type HugReceivedEvent } from "../bus/events.ts";
import { isMember, type MemberId } from "../workspace/directory.ts";
import { hugRewardsOnAndExposedFor } from "./flag.ts";
import { countReceivedOnTheMessage, hugOf, hugPeoplePageOf, insertPaid, isPaid, type Hug } from "./records.ts";
import { countHugReceived, weekOfPersonAt } from "./weeks.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

const peopleAPage = 100;

export const payHugPeopleArgs = z.strictObject({ event: hugGivenEventValidator, cursor: z.optional(z.string()) });
export async function payHugPeople(ctx: MutationContext, { event, cursor }: z.infer<typeof payHugPeopleArgs>): Promise<void> {
  const hug = await hugOf(ctx, event.message, event.giver);
  if (hug === null) return;
  const { people, next } = await hugPeoplePageOf(ctx, hug, cursor ?? null, peopleAPage);
  for (const person of people) await payPerson(ctx, hug, person);
  if (next !== null) await ctx.jobs.enqueue(payHugPeopleJob, { event, cursor: next });
}
export const payHugPeopleJob = mutationJob("hugs.people.payHugPeople", payHugPeopleArgs, payHugPeople);

async function payPerson(ctx: MutationContext, hug: Hug, person: MemberId) {
  if (!(await isMember(ctx, person)) || (await isPaid(ctx, hug, person))) return;
  await insertPaid(ctx, hug, person);
  await countReceivedOnTheMessage(ctx, hug, person);
  await countHugReceived(ctx, hug, person);
  await publishHugReceived(ctx, hug, person);
}

async function publishHugReceived(ctx: MutationContext, { workspace, conversation, message, giver, at }: Hug, person: MemberId) {
  const week = await weekOfPersonAt(ctx, person, at);
  const rewards = await hugRewardsOnAndExposedFor(ctx, person);
  const received: HugReceivedEvent = { type: "hugReceived", workspace, giver, person, message: { workspace, conversation, message }, at, week, rewards };
  await ctx.publish(received);
}
