// The website API's routes answer what their Convex functions did, checked by the root typecheck: every route of the
// table names a website function of the same kind, takes the arguments it took and answers what it answered, a denial
// included. The website's code keeps typing unchanged while the rewrite moves it from Convex to the route table.
//
// It lives outside `service/` because the service may import nothing of Convex (`service/src/noConvex.test.ts`), and
// it goes when Convex does. The comparison is of shapes, member by member of each union and field by field at every
// depth: a dropped field, optional or not, a field that turned optional, a string the website matches spelled otherwise,
// or an `any` anywhere fails the typecheck with the route's name.
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import type { GenericId } from "convex/values";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../service/src/db/columns.ts";
import type { Denial } from "../../service/src/website/memberQuery.ts";
import type { ArgsOf, ArgsShape, CommandRoute, ReadRoute, Route } from "../../service/src/website/api/route.ts";
import type { websiteRoutes } from "../../service/src/website/api/table.ts";
// The service owns zod; the root package has none of its own.
import type { z } from "../../service/node_modules/zod";

/** Convex's id of a table as the service writes it. */
type AsService<T> =
  T extends GenericId<infer Table>
    ? Id<Table>
    : T extends readonly (infer Item)[]
      ? AsService<Item>[]
      : T extends object
        ? { [Key in keyof T]: AsService<T[Key]> }
        : T;

type IsAny<T> = 0 extends 1 & T ? true : false;
type Primitive = string | number | boolean | bigint | null | undefined;

/**
 * True when A and B are the same shape: each member of either union has a member of the other of the same shape, with
 * the same fields at every depth, each as optional, and no `any` anywhere, which would pass for every shape.
 */
export type Same<A, B> = IsAny<A> extends true ? false : IsAny<B> extends true ? false : [A] extends [never] ? [B] extends [never] ? true : false : [B] extends [never] ? false : Covers<A, B> extends true ? Covers<B, A> : false;

// Every member of A has a member of B of the same shape.
type Covers<A, B> = false extends (A extends unknown ? HasMatch<A, B> : never) ? false : true;
type HasMatch<One, B> = true extends (B extends unknown ? SameMember<One, B> : never) ? true : false;

type SameMember<A, B> = IsAny<A> extends true
  ? false
  : IsAny<B> extends true
    ? false
    : A extends Primitive
      ? B extends Primitive
        ? [A] extends [B] ? ([B] extends [A] ? true : false) : false
        : false
      : B extends Primitive
        ? false
        : A extends readonly (infer X)[]
          ? B extends readonly (infer Y)[] ? Same<X, Y> : false
          : B extends readonly unknown[]
            ? false
            : SameFields<A, B>;

type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

type SameFields<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? false extends { [K in keyof A & keyof B]: IsOptional<A, K> extends IsOptional<B, K> ? Same<A[K], B[K]> : false }[keyof A & keyof B]
      ? false
      : true
    : false
  : false;

/** Convex's arguments of a function that takes none, `Record<string, never>`, and zod's, as `{}`. */
type NoneAsEmpty<T> = string extends keyof T ? ([T[string]] extends [never] ? {} : T) : T;

type Websites = typeof api.website;

/** The Convex function a route's name names, or never when there is none. */
type ConvexFunction<Name> = Name extends `website.${infer Module}.${infer Function}`
  ? Module extends keyof Websites
    ? Function extends keyof Websites[Module]
      ? Websites[Module][Function]
      : never
    : never
  : never;

type Kind<R> = R extends ReadRoute ? "query" : "mutation";
type Args<R> = R extends ReadRoute<string, infer Shape extends ArgsShape, unknown> | CommandRoute<string, infer Shape extends ArgsShape, unknown> ? NoneAsEmpty<z.input<ArgsOf<Shape>>> : never;
type Result<R> = R extends ReadRoute<string, ArgsShape, infer Answer> | CommandRoute<string, ArgsShape, infer Answer> ? Answer : never;

/** Why a route doesn't answer as its Convex function did, or never when it does. */
export type Mismatch<R extends Route> =
  [ConvexFunction<R["name"]>] extends [never]
    ? "no website function has this name"
    : ConvexFunction<R["name"]> extends FunctionReference<infer Type>
      ? Type extends Kind<R>
        ? Same<Args<R>, NoneAsEmpty<AsService<FunctionArgs<ConvexFunction<R["name"]>>>>> extends false
          ? "its arguments differ from the function's"
          : Same<Result<R> | Denial, AsService<FunctionReturnType<ConvexFunction<R["name"]>>>> extends false
            ? "its answer differs from the function's"
            : never
        : `the function is a ${Type}, the route a ${Kind<R>}`
      : "no website function has this name";

/** Each route that answers otherwise than its Convex function, by name, with why. */
export type Mismatches<Routes extends readonly Route[]> = {
  [R in Routes[number] as [Mismatch<R>] extends [never] ? never : R["name"]]: Mismatch<R>;
};

/** True when every route answers as its Convex function did; otherwise the mismatches, which the error names. */
export type AnswersAsConvexDid<Routes extends readonly Route[]> = keyof Mismatches<Routes> extends never ? true : Mismatches<Routes>;

// The check itself. A failure reads: Type 'true' is not assignable to type '{ "website.album.getAlbum": "its answer differs from the function's" }'.
export const everyRouteAnswersAsConvexDid: AnswersAsConvexDid<typeof websiteRoutes> = true;

// The check's own proof: a route that answers as its function did passes, and each kind of mismatch fails.
type Identity = { token: string; host: string; distinctId: string; environment: FunctionReturnType<typeof api.website.browserAnalytics.getBrowserAnalytics> extends infer A ? (A extends { environment: infer E } ? E : never) : never };
type Analytics = { kind: "off" } | ({ kind: "capture" } & Identity);
type NoArgs = {};
type Analyses<Result, Shape extends ArgsShape = NoArgs> = AnswersAsConvexDid<[ReadRoute<"website.browserAnalytics.getBrowserAnalytics", Shape, Result>]>;

export const answersAsItsFunction: Analyses<Analytics> = true;
// @ts-expect-error the route answers a kind its function never did
export const answersAnotherKind: Analyses<Analytics | { kind: "on" }> = true;
// @ts-expect-error the route drops a field the function answered
export const dropsAField: Analyses<{ kind: "off" } | ({ kind: "capture" } & Omit<Identity, "distinctId">)> = true;
// @ts-expect-error the route answers anything at all
export const answersAny: Analyses<any> = true;
// @ts-expect-error the route answers anything in one field
export const answersAnyField: Analyses<{ kind: "off" } | ({ kind: "capture" } & Omit<Identity, "token"> & { token: any })> = true;
// @ts-expect-error the route takes an argument the function didn't
export const takesAnotherArgument: Analyses<Analytics, { member: z.ZodString }> = true;
// @ts-expect-error a read for what was a command
export const readsACommand: AnswersAsConvexDid<[ReadRoute<"website.commands.buyPerk", ArgsShape, unknown>]> = true;
// @ts-expect-error no website function has the route's name
export const namesNothing: AnswersAsConvexDid<[ReadRoute<"website.album.noSuchThing", NoArgs, null>]> = true;

// The comparison on its own, where today's answers have no case to show it.
type Holds<T extends true> = T;
type Card = { name: string; week?: { number: number }; kind: "player" | "team"; ids: readonly string[] };
export type SameShape = Holds<Same<Card, { name: string; week?: { number: number }; kind: "player" | "team"; ids: string[] }>>;
// @ts-expect-error an optional field dropped
export type DropsAnOptionalField = Holds<Same<Card, Omit<Card, "week">>>;
// @ts-expect-error a field that turned optional
export type TurnsOptional = Holds<Same<Card, Omit<Card, "name"> & { name?: string }>>;
// @ts-expect-error a field dropped inside a field
export type DropsADeepField = Holds<Same<Card, Omit<Card, "week"> & { week?: {} }>>;
// @ts-expect-error a literal union that lost a member
export type LosesAMember = Holds<Same<Card, Omit<Card, "kind"> & { kind: "player" }>>;
// @ts-expect-error null for undefined
export type NullForUndefined = Holds<Same<{ at: number | undefined }, { at: number | null }>>;
