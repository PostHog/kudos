// A job is a mutation or an action the worker runs later, by name. Its name is the former Convex function's path,
// dotted, so a loaded pending job maps to its handler; its zod schema types `enqueue` and checks a job's args before
// it runs. A job is scheduled with the schema's input, stored as given, and runs with its output: a transform runs
// once, when the job runs.
import type { z } from "zod";
import type { ActionContext, MutationContext } from "../operations.ts";

export interface MutationJob<Args = unknown, Input = Args> {
  name: string;
  kind: "mutation";
  args: z.ZodType<Args, Input>;
  /** Runs in one SERIALIZABLE transaction that also marks the job done: exactly once. */
  handler(ctx: MutationContext, args: Args): Promise<unknown>;
}

export interface ActionJob<Args = unknown, Input = Args> {
  name: string;
  kind: "action";
  args: z.ZodType<Args, Input>;
  /** Runs outside a transaction, at most once: marked running before it starts, never started again. */
  handler(ctx: ActionContext, args: Args): Promise<unknown>;
}

// A registry holds jobs of every args type.
export type Job<Args = any, Input = any> = MutationJob<Args, Input> | ActionJob<Args, Input>;

/** Every job the service can run, by name. */
export type JobRegistry = ReadonlyMap<string, Job>;

export function mutationJob<Schema extends z.ZodType>(
  name: string,
  args: Schema,
  handler: (ctx: MutationContext, args: z.output<Schema>) => Promise<unknown>,
): MutationJob<z.output<Schema>, z.input<Schema>> {
  return { name, kind: "mutation", args: args as z.ZodType<z.output<Schema>, z.input<Schema>>, handler };
}

export function actionJob<Schema extends z.ZodType>(
  name: string,
  args: Schema,
  handler: (ctx: ActionContext, args: z.output<Schema>) => Promise<unknown>,
): ActionJob<z.output<Schema>, z.input<Schema>> {
  return { name, kind: "action", args: args as z.ZodType<z.output<Schema>, z.input<Schema>>, handler };
}

export function jobRegistry(jobs: Job[]): JobRegistry {
  const registry = new Map<string, Job>();
  for (const job of jobs) {
    if (registry.has(job.name)) throw new Error(`Two jobs are registered as ${job.name}`);
    registry.set(job.name, job);
  }
  return registry;
}
