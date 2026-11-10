// The website API's routes answer what their Convex functions did, checked by the root typecheck: every route of the
// table names a website function of the same kind, takes the arguments it took and answers what it answered, a denial
// included. The website's code keeps typing unchanged while the rewrite moves it from Convex to the route table.
//
// It lives outside `service/` because the service may import nothing of Convex (`service/src/noConvex.test.ts`), and
// it goes when Convex does. Two shapes are the same when each takes every value of the other, no `any` hides anywhere,
// and each member of a union has a twin on the other side with the same fields at every depth, each as optional. A
// dropped field, optional or not, a field that turned optional, a field moved from one member of a union to another,
// a string the website matches spelled otherwise, or an `any` anywhere fails the typecheck with the route's name. Two
// unions that hold the same values pass however they are split, as `{ groups: boolean }` and
// `{ groups: true } | { groups: false }` do.
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import type { GenericId } from "convex/values";
import type { api } from "../../convex/_generated/api";
import type { OpenAnswer } from "../../convex/website/album";
import type { PlayerCardRead } from "../../convex/website/playerCard";
import type { Id } from "../../service/src/db/columns.ts";
import type { Denial } from "../../service/src/website/memberQuery.ts";
import type { ArgsShape, CommandRoute, ReadRoute, Route } from "../../service/src/website/api/route.ts";
import type { websiteRoutes } from "../../service/src/website/api/table.ts";
// The service owns zod; the root package has none of its own.
import type { z } from "../../service/node_modules/zod";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** A shape as both sides write it: Convex's ids as the service's, arrays and fields not readonly. */
type Plain<T> =
  IsAny<T> extends true
    ? T
    : unknown extends T
      ? T
      : T extends GenericId<infer Table>
        ? Id<Table>
        : T extends string
          ? IdsInTemplate<T>
        : T extends Primitive
          ? T
          : T extends (...args: never[]) => unknown
            ? T
            : T extends readonly unknown[]
              ? number extends T["length"]
                ? Plain<T[number]>[]
                : { -readonly [Index in keyof T]: Plain<T[Index]> }
              : { -readonly [Key in keyof T]: Plain<T[Key]> };

// An id inside a template literal, as `hype:${MemberId}`, is the same string on the wire on both sides, but TypeScript
// keeps Convex's id and the service's apart there and infers no table through a template's placeholder. So every
// branded placeholder of a template reads as an id of any table, on both sides: the template's text and its other
// placeholders still compare, and only the table of an id inside a template goes unchecked.
type IsTemplate<T extends string> = {} extends Record<T, 0> ? true : false;
type TemplatePart<Part extends string> = string extends Part ? Part : Part extends `${number}` ? Part : IsTemplate<Part> extends true ? `${Id<string>}` : Part;
type WithPlainIds<T extends string, Done extends string = ""> = T extends `${infer Part}${infer Rest}` ? WithPlainIds<Rest, `${Done}${TemplatePart<Part>}`> : `${Done}${T}`;
// A bare id, Convex's read as the service's above, splits into no parts and stays whole.
type IdsInTemplate<T extends string> = string extends T ? T : IsTemplate<T> extends true ? (T extends `${infer _Part}${infer _Rest}` ? WithPlainIds<T> : T) : T;

/** True somewhere in the union when `any` hides in T at any depth. */
type HasAny<T> =
  IsAny<T> extends true
    ? true
    : T extends Primitive
      ? false
      : T extends (...args: never[]) => unknown
        ? false
        : T extends readonly unknown[]
          ? HasAny<T[number]>
          : true extends { [Key in keyof T]-?: HasAny<T[Key]> }[keyof T]
            ? true
            : false;

type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

type Leaf = Primitive | ((...args: never[]) => unknown);

/** The fields of one object, each spelled with `?` when it is optional. */
type Keys<T> = { [Key in Extract<keyof T, string | number>]-?: `${Key}${IsOptional<T, Key> extends true ? "?" : ""}` }[Extract<keyof T, string | number>];

type Takes<A, B> = [B] extends [A] ? true : false;

/**
 * True when each member of either union has a twin in the other: a member that shares some value with it, so never one
 * of another `kind`, with the same fields, each as optional, whose fields' values are twins in turn at every depth.
 * Values themselves are assignability's to judge, so a value that one side splits across members, as
 * `{ groups: true } | { groups: false }` splits `{ groups: boolean }`, has a twin on each side.
 */
type Structure<A, B> = Twins<A, B> extends true ? Twins<B, A> : false;
type Twins<A, B> = false extends (A extends unknown ? HasTwin<A, B> : never) ? false : true;
type HasTwin<One, B> = true extends (B extends unknown ? IsTwin<One, B> : never) ? true : false;
type IsTwin<A, B> = A extends Leaf
  ? B extends Leaf
    ? true
    : false
  : B extends Leaf
    ? false
    : A extends readonly unknown[]
      ? B extends readonly unknown[]
        ? Structure<A[number], B[number]>
        : false
      : B extends readonly unknown[]
        ? false
        : [A & B] extends [never]
          ? false
          : Takes<Keys<A>, Keys<B>> extends true
            ? Takes<Keys<B>, Keys<A>> extends true
              ? false extends { [Key in keyof A & keyof B]-?: Structure<A[Key], B[Key]> }[keyof A & keyof B]
                ? false
                : true
              : false
            : false;

/** True when A and B are the same shape: each takes every value of the other, no `any` hides in either, and each member has a twin of the same fields at every depth. */
export type Same<A, B> = true extends HasAny<A> | HasAny<B>
  ? false
  : Takes<Plain<A>, Plain<B>> extends true
    ? Takes<Plain<B>, Plain<A>> extends true
      ? Structure<Plain<A>, Plain<B>>
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

// Read off the route's own fields: a route whose handler takes required arguments is no `ReadRoute` of the default shape.
type Kind<R extends Route> = R["kind"];
type Args<R extends Route> = NoneAsEmpty<z.input<R["args"]>>;
type Result<R extends Route> = R["handler"] extends (...args: never[]) => Promise<infer Answer> ? Answer : never;

/** Why a route doesn't answer as its Convex function did, or never when it does. */
export type Mismatch<R extends Route> =
  [ConvexFunction<R["name"]>] extends [never]
    ? "no website function has this name"
    : ConvexFunction<R["name"]> extends FunctionReference<infer Type>
      ? Type extends Kind<R>
        ? Same<Args<R>, NoneAsEmpty<Plain<FunctionArgs<ConvexFunction<R["name"]>>>>> extends false
          ? "its arguments differ from the function's"
          : Same<Result<R> | Denial, Plain<FunctionReturnType<ConvexFunction<R["name"]>>>> extends false
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
// Routes whose handlers take required arguments, a read and a command, as S16 and S17 will add them.
export const readsWithArguments: AnswersAsConvexDid<[ReadRoute<"website.playerCard.getPlayerCard", { person: z.ZodString }, PlayerCardRead>]> = true;
export const commandsWithArguments: AnswersAsConvexDid<[CommandRoute<"website.album.openThoughtfulPack", { pack: z.ZodString }, OpenAnswer>]> = true;
// @ts-expect-error a command with arguments for what was a read
export const commandsARead: AnswersAsConvexDid<[CommandRoute<"website.playerCard.getPlayerCard", { person: z.ZodString }, PlayerCardRead>]> = true;
// @ts-expect-error a command with arguments that answers otherwise
export const commandsWithAnotherAnswer: AnswersAsConvexDid<[CommandRoute<"website.album.openThoughtfulPack", { pack: z.ZodString }, { kind: "refused" }>]> = true;

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
// @ts-expect-error a tuple reordered
export type ReordersATuple = Holds<Same<[string, number], [number, string]>>;
// @ts-expect-error a tuple of another length
export type LengthensATuple = Holds<Same<[string], [string, string]>>;
// @ts-expect-error anything for an empty object
export type UnknownForEmpty = Holds<Same<unknown, {}>>;
export type SplitsABoolean = Holds<Same<{ name: string; groups: boolean }, { name: string; groups: true } | { name: string; groups: false }>>;
export type SpellsARecordOtherwise = Holds<Same<Record<string, { x: number }>, { [key: string]: { x: number } }>>;
// @ts-expect-error a field moved between members: the route takes { g: "x" }, which the function refused
export type MovesAFieldBetweenMembers = Holds<Same<{ f?: number } | { f: number; g?: string }, { f: number } | { f?: number; g?: string }>>;
// @ts-expect-error a field moved between members one field down
export type MovesAFieldOneDown = Holds<Same<{ card: { f?: number } | { f: number; g?: string } }, { card: { f: number } | { f?: number; g?: string } }>>;
// @ts-expect-error an optional field moved to a member of another kind
export type MovesAFieldToAnotherKind = Holds<Same<{ kind: "a"; f?: number } | { kind: "b" }, { kind: "a" } | { kind: "b"; f?: number }>>;
// @ts-expect-error an optional field moved to a member of another kind, one field down
export type MovesAFieldToAnotherKindOneDown = Holds<Same<{ card: { kind: "a"; f?: number } | { kind: "b" } }, { card: { kind: "a" } | { kind: "b"; f?: number } }>>;
export type SplitsAKind = Holds<Same<{ kind: "a" | "b"; f?: number }, { kind: "a"; f?: number } | { kind: "b"; f?: number }>>;
export type ReadsAConvexId = Holds<Same<{ member: Id<"members"> }, { member: GenericId<"members"> }>>;
export type ReadsAnIdInATemplate = Holds<
  Same<
    `level:${number}` | `milestone:${Id<"milestones">}:${"gold" | "silver"}` | `team:${string}` | `hype:${Id<"members">}`,
    `level:${number}` | `milestone:${GenericId<"milestones">}:${"gold" | "silver"}` | `team:${string}` | `hype:${GenericId<"members">}`
  >
>;
// @ts-expect-error a template spelled otherwise around its id
export type RespellsATemplate = Holds<Same<`pet:${Id<"members">}`, `hype:${GenericId<"members">}`>>;
// @ts-expect-error any string where the function had an id inside a template
export type AnyStringForAnIdInATemplate = Holds<Same<`hype:${string}`, `hype:${GenericId<"members">}`>>;
// @ts-expect-error a template of one id for a template of two
export type DropsAnIdFromATemplate = Holds<Same<`pair:${Id<"members">}`, `pair:${GenericId<"members">}:${GenericId<"members">}`>>;
