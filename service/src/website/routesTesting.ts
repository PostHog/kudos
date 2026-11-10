// Tests call another stack's website handler by its route name, as the website's code does. Website handlers get no
// module-map stubs, so while no stack registers the route, a call ends in `notPorted(<route name>)` and the test waits
// on that stack; once the route is in the table, the same call runs its handler and the test's assertions decide.
// `websiteAs` calls a route through the whole app instead, for the tests whose subject is the member check or the
// route's arguments.
import type { HomeMember } from "../feedback/homes.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { lookup } from "../workspace/directory.ts";
import type { Seeder } from "../../testing/seed.ts";
import type { Route } from "./api/route.ts";
import { apiHeader } from "./api/transport.ts";
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

/**
 * The header the hosting edge sets on a gated path for whoever signed in through its SSO, which S15's identity mapping
 * (15.2) reads; a request without it is signed out. There is no session of the app's own.
 */
export const signedInEmailHeader = "x-auth-request-email";

/** An app as the test backend boots it, with what it logged. */
export interface AppUnderTest {
  app: { request(path: string, init: RequestInit): Response | Promise<Response> };
  logs: ReadonlyArray<{ message: string; fields: Record<string, unknown> }>;
}

/**
 * The website's API as the website's code calls it through the whole app, with the app's own identity mapping and member
 * check: signed in through SSO as `email`, or signed out with `null`. A route's JSON answer comes back, a denial
 * included. A request that ends in a body another stack has yet to port answers 500, and the request log names the
 * error's class only, so that one failure comes back as the `NotPortedError` a waiting test waits on; any other status
 * throws with the transport's reason, as today's argument validator threw.
 */
export function websiteAs(t: AppUnderTest, email: string | null) {
  const answerOf = async <Result>(kind: "query" | "mutation", name: string, args: Record<string, unknown>): Promise<Result> => {
    // A website function no stack has registered yet is no route, so the request would only answer 404: it waits on
    // that stack as at its stub, as `readByRoute` and `commandByRoute` do.
    routeNamed(name);
    const path = `/api/${kind}/${name}`;
    const loggedBefore = t.logs.length;
    const answer = await t.app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", [apiHeader]: "1", ...(email !== null && { [signedInEmailHeader]: email }) },
      body: JSON.stringify(args),
    });
    const stubbed = t.logs.slice(loggedBefore).some(({ message, fields }) => message === "request failed" && fields.path === path && fields.error === "NotPortedError");
    if (answer.status === 500 && stubbed) throw notPorted(`${name}, through the app`);
    if (answer.status !== 200) throw new Error(`${name} answered ${answer.status}: ${((await answer.json()) as { error: string }).error}`);
    return (await answer.json()) as Result;
  };
  return {
    read: <Result = unknown>(name: string, args: Record<string, unknown> = {}) => answerOf<Result>("query", name, args),
    command: <Result = unknown>(name: string, args: Record<string, unknown> = {}) => answerOf<Result>("mutation", name, args),
  };
}

/** What the transport answers arguments outside a route's shape, before anyone is looked up: today's validator error. */
export const argumentsRefused = "the arguments don't fit the route";

/**
 * Today's `aSession`/`aSignedInSession` in the service: the person signs in through SSO with an email, which the
 * directory row the workspace already has for them carries, and the website's requests come as them. A made-up email
 * stands in when the person has none. Answers the website's API as that person.
 */
export async function signedInThroughSso(t: AppUnderTest & { seed: Seeder }, person: { user: string; email?: string }, workspace = "T1") {
  const email = person.email ?? `${person.user.toLowerCase()}@example.com`;
  for (const row of await t.seed.all("members")) {
    if (row.workspace === workspace && row.user === person.user && row.email !== email) await t.seed.patch("members", row._id, { email });
  }
  return websiteAs(t, email);
}
