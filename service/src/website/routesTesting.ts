// Tests call another stack's website handler by its route name, as the website's code does. Website handlers get no
// module-map stubs, so while no stack registers the route, a call ends in `notPorted(<route name>)` and the test waits
// on that stack; once the route is in the table, the same call runs its handler and the test's assertions decide.
import type { HomeMember } from "../feedback/homes.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { lookup } from "../workspace/directory.ts";
import type { Route } from "./api/route.ts";
import { websiteRoutes } from "./api/table.ts";
import type { VerifiedMember } from "./memberQuery.ts";

function routeNamed(name: string): Route {
  const route = (websiteRoutes as readonly Route[]).find((each) => each.name === name);
  if (route === undefined) throw notPorted(name);
  return route;
}

/** A website read by its route name, past the member check: `me` is the member it already verified. */
export async function readByRoute<Result>(name: string, ctx: QueryContext, me: VerifiedMember, args: Record<string, unknown> = {}): Promise<Result> {
  const route = routeNamed(name);
  if (route.kind !== "query") throw new Error(`${name} is a command, not a read`);
  return (await route.handler(ctx, me, route.args.parse(args))) as Result;
}

/** A website command by its route name, past the member check, sent as the member's home row, as the transport sends it. */
export async function commandByRoute<Result>(name: string, ctx: MutationContext, me: VerifiedMember, args: Record<string, unknown> = {}): Promise<Result> {
  const route = routeNamed(name);
  if (route.kind !== "mutation") throw new Error(`${name} is a read, not a command`);
  const person = (await lookup(ctx, me.workspace, me.user)) as HomeMember;
  return (await route.handler(ctx, me, person, route.args.parse(args))) as Result;
}
