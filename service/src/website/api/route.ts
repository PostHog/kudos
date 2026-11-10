// A route of the website's API: one read or one command the website's code calls, named by its former Convex path
// (`website.album.getAlbum`), with the zod schema its arguments must pass and its handler. Only a verified member
// reaches a handler; anyone else gets the denial today's member check answers, as the result.
import type { z } from "zod";
import type { HomeMember } from "../../feedback/homes.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import type { Denial, VerifiedMember } from "../memberQuery.ts";

/** A route's arguments: an object, as a Convex function's were. */
export type RouteArgs = z.ZodType<Record<string, unknown>, Record<string, unknown>>;

export type ReadHandler<Args, Result> = (ctx: QueryContext, me: VerifiedMember, args: Args) => Promise<Result>;

export type CommandHandler<Args, Result> = (ctx: MutationContext, me: VerifiedMember, person: HomeMember, args: Args) => Promise<Result>;

export interface ReadRoute<Name extends string = string, Args extends RouteArgs = RouteArgs, Result = unknown> {
  kind: "query";
  name: Name;
  args: Args;
  handler: ReadHandler<z.output<Args>, Result>;
  /** Only the types use it: what a reader gets back, the denial included. */
  readonly answer?: Result | Denial;
}

export interface CommandRoute<Name extends string = string, Args extends RouteArgs = RouteArgs, Result = unknown> {
  kind: "mutation";
  name: Name;
  args: Args;
  handler: CommandHandler<z.output<Args>, Result>;
  /** Only the types use it: what a sender gets back, the denial included. */
  readonly answer?: Result | Denial;
}

export type Route = ReadRoute<string, RouteArgs, any> | CommandRoute<string, RouteArgs, any>;

// A former Convex path of a website function: `website.<module>.<function>`, letters and digits only.
const routeName = /^website\.[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/;

function named(name: string): void {
  if (!routeName.test(name)) throw new Error(`A website route is named website.<module>.<function>, not ${JSON.stringify(name)}`);
}

/** A read only a member who passes today's member check reaches: Convex's `memberQuery`. */
export function memberRead<const Name extends string, Args extends RouteArgs, Result>(name: Name, args: Args, handler: ReadHandler<z.output<Args>, Result>): ReadRoute<Name, Args, Result> {
  named(name);
  return { kind: "query", name, args, handler };
}

/** A command only a member the website admits reaches: Convex's `memberMutation`. */
export function memberCommand<const Name extends string, Args extends RouteArgs, Result>(name: Name, args: Args, handler: CommandHandler<z.output<Args>, Result>): CommandRoute<Name, Args, Result> {
  named(name);
  return { kind: "mutation", name, args, handler };
}
