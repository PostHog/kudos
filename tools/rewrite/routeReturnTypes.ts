// The website API's routes answer what their Convex functions did, checked by the root typecheck: every route of the
// table names a website function of the same kind, takes the arguments it took and answers what it answered, a denial
// included. The website's code keeps typing unchanged while the rewrite moves it from Convex to the route table.
//
// It lives outside `service/` because the service may import nothing of Convex (`service/src/noConvex.test.ts`), and
// it goes when Convex does. Each route's result is compared both ways, so a field the website reads that the route
// drops, or a string the website matches that the route spells differently, fails the typecheck with the route's name.
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import type { GenericId } from "convex/values";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../service/src/db/columns.ts";
import type { Denial } from "../../service/src/website/memberQuery.ts";
import type { CommandRoute, ReadRoute, Route, RouteArgs } from "../../service/src/website/api/route.ts";
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

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

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
type Args<R> = R extends ReadRoute<string, infer A extends RouteArgs, unknown> | CommandRoute<string, infer A extends RouteArgs, unknown> ? z.input<A> : never;
type Result<R> = R extends ReadRoute<string, RouteArgs, infer Answer> | CommandRoute<string, RouteArgs, infer Answer> ? Answer : never;

/** Why a route doesn't answer as its Convex function did, or never when it does. */
export type Mismatch<R extends Route> =
  [ConvexFunction<R["name"]>] extends [never]
    ? "no website function has this name"
    : ConvexFunction<R["name"]> extends FunctionReference<infer Type>
      ? Type extends Kind<R>
        ? Same<Args<R>, AsService<FunctionArgs<ConvexFunction<R["name"]>>>> extends false
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
type NoArgs = z.ZodObject<{}>;

export const answersAsItsFunction: AnswersAsConvexDid<[ReadRoute<"website.browserAnalytics.getBrowserAnalytics", NoArgs, Analytics>]> = true;
// @ts-expect-error the route answers a kind its function never did
export const answersAnotherKind: AnswersAsConvexDid<[ReadRoute<"website.browserAnalytics.getBrowserAnalytics", NoArgs, Analytics | { kind: "on" }>]> = true;
// @ts-expect-error the route drops a field the function answered
export const dropsAField: AnswersAsConvexDid<[ReadRoute<"website.browserAnalytics.getBrowserAnalytics", NoArgs, { kind: "off" } | ({ kind: "capture" } & Omit<Identity, "distinctId">)>]> = true;
// @ts-expect-error the route takes an argument the function didn't
export const takesAnotherArgument: AnswersAsConvexDid<[ReadRoute<"website.browserAnalytics.getBrowserAnalytics", z.ZodObject<{ member: z.ZodString }>, Analytics>]> = true;
// @ts-expect-error a read for what was a command
export const readsACommand: AnswersAsConvexDid<[ReadRoute<"website.commands.buyPerk", RouteArgs, unknown>]> = true;
// @ts-expect-error no website function has the route's name
export const namesNothing: AnswersAsConvexDid<[ReadRoute<"website.album.noSuchThing", NoArgs, null>]> = true;
