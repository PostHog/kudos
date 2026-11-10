// A route of the website's API: one read or one command the website's code calls, named by its former Convex path
// (`website.album.getAlbum`), with the shape of its arguments, as a Convex function's `args`, and its handler. Only a
// verified member reaches a handler; anyone else gets the denial today's member check answers, as the result.
import { z } from "zod";
import type { HomeMember } from "../../feedback/homes.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import type { Denial, VerifiedMember } from "../memberQuery.ts";

/** A route's arguments, field by field, as a Convex function's `args` were. */
export type ArgsShape = Record<string, z.ZodType>;

/** The schema a route's arguments must pass: its shape, refusing any field the shape doesn't name. */
export type ArgsOf<Shape extends ArgsShape> = z.ZodObject<Shape, z.core.$strict>;

export type ReadHandler<Args, Result> = (ctx: QueryContext, me: VerifiedMember, args: Args) => Promise<Result>;

export type CommandHandler<Args, Result> = (ctx: MutationContext, me: VerifiedMember, person: HomeMember, args: Args) => Promise<Result>;

export interface ReadRoute<Name extends string = string, Shape extends ArgsShape = ArgsShape, Result = unknown> {
  kind: "query";
  name: Name;
  args: ArgsOf<Shape>;
  handler: ReadHandler<z.output<ArgsOf<Shape>>, Result>;
  /** Only the types use it: what a reader gets back, the denial included. */
  readonly answer?: Result | Denial;
}

export interface CommandRoute<Name extends string = string, Shape extends ArgsShape = ArgsShape, Result = unknown> {
  kind: "mutation";
  name: Name;
  args: ArgsOf<Shape>;
  handler: CommandHandler<z.output<ArgsOf<Shape>>, Result>;
  /** Only the types use it: what a sender gets back, the denial included. */
  readonly answer?: Result | Denial;
}

export type Route = ReadRoute<string, any, any> | CommandRoute<string, any, any>;

// A former Convex path of a website function: `website.<module>.<function>`, letters and digits only.
const routeName = /^website\.[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/;

function defined<Shape extends ArgsShape>(name: string, shape: Shape): ArgsOf<Shape> {
  if (!routeName.test(name)) throw new Error(`A website route is named website.<module>.<function>, not ${JSON.stringify(name)}`);
  for (const [field, schema] of Object.entries(shape)) refuseLooseObjects(schema, `${name}(${field})`);
  return z.strictObject(shape);
}

/** A read only a member who passes today's member check reaches: Convex's `memberQuery`. */
export function memberRead<const Name extends string, Shape extends ArgsShape, Result>(name: Name, args: Shape, handler: ReadHandler<z.output<ArgsOf<Shape>>, Result>): ReadRoute<Name, Shape, Result> {
  return { kind: "query", name, args: defined(name, args), handler };
}

/** A command only a member the website admits reaches: Convex's `memberMutation`. */
export function memberCommand<const Name extends string, Shape extends ArgsShape, Result>(name: Name, args: Shape, handler: CommandHandler<z.output<ArgsOf<Shape>>, Result>): CommandRoute<Name, Shape, Result> {
  return { kind: "mutation", name, args: defined(name, args), handler };
}

/**
 * Convex refused a field its validator didn't name, at any depth, and had no transforms. A nested `z.object` would drop
 * an unknown field silently, so every object inside a route's arguments must be `z.strictObject`, and only the kinds of
 * value a Convex validator could describe may appear; the service refuses to start otherwise. Unknown kinds fail closed.
 */
const plainValues: ReadonlySet<string> = new Set(["string", "number", "boolean", "bigint", "null", "undefined", "literal", "enum", "nan", "template_literal"]);

function refuseLooseObjects(schema: z.ZodType, at: string): void {
  const def = schema._zod.def as unknown as Record<string, unknown> & { type: string };
  const inner = (value: unknown, where = at) => refuseLooseObjects(value as z.ZodType, where);
  if (plainValues.has(def.type)) return;
  switch (def.type) {
    case "object": {
      const catchall = def.catchall as { _zod: { def: { type: string } } } | undefined;
      if (catchall?._zod.def.type !== "never") throw new Error(`${at} is an object that keeps unknown fields; use z.strictObject, as Convex refused them`);
      for (const [field, value] of Object.entries(def.shape as Record<string, unknown>)) inner(value, `${at}.${field}`);
      return;
    }
    case "optional":
    case "nullable":
    case "default":
    case "readonly":
    case "nonoptional":
      return inner(def.innerType);
    case "array":
      return inner(def.element, `${at}[]`);
    case "union":
      for (const option of def.options as unknown[]) inner(option);
      return;
    case "record":
      inner(def.keyType, `${at}[key]`);
      return inner(def.valueType, `${at}[*]`);
    case "tuple":
      for (const item of def.items as unknown[]) inner(item);
      if (def.rest) inner(def.rest, `${at}[...]`);
      return;
    default:
      throw new Error(`${at} is a zod ${def.type}, which a route's arguments can't hold: use the plain values, objects, arrays, records, tuples and unions a Convex validator could describe`);
  }
}
