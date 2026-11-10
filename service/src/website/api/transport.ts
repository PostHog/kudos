// The website's API over HTTP: `POST /api/query/<name>` runs a read and `POST /api/mutation/<name>` a command of the
// route table, each in one operation of its own, with the arguments its zod schema passed. The answer is the route's
// result as JSON, a denial included; anything else is an error status with a short reason and no detail.
//
// A request must be JSON and carry the API's own header. A cross-site page can send neither without the browser asking
// first (a CORS preflight), which the service never grants, so no form or link on another site runs a command.
//
// `GET /api/live` is a member's stream of invalidations (liveStream.ts), which the website follows to refetch what its
// open views hold. The browser's EventSource sends no header of the API's, so it is refused only when cross-site; it
// reads nothing but who may follow, and answers a denial as a read does.
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { HomeMember } from "../../feedback/homes.ts";
import type { LiveFeed } from "../../live.ts";
import type { Log } from "../../log.ts";
import type { MutationContext, Operations, QueryContext } from "../../operations.ts";
import type { Denial, Verified, VerifiedMember } from "../memberQuery.ts";
import { liveStream, liveStreamHeaders } from "./liveStream.ts";
import type { Route } from "./route.ts";

/** The header every API request carries; its value is `1`. */
export const apiHeader = "x-hedgehug-api";

/** The largest body a request may send, read before anything parses it; the website's arguments are a few fields. */
export const maxBodyBytes = 64 * 1024;

/** Who a request says it is, once the edge's identity is mapped to a chat identity. */
export type SignedIn = Omit<VerifiedMember, "member">;

/** The person a request signs in as, or why it names nobody: no one signed in, or someone the workspace doesn't have. */
export type Identity = SignedIn | Extract<Denial, { kind: "signed-out" | "not-a-member" }>;

/** Maps a request to the person it signs in as, outside any transaction (it may ask Slack). */
export type Identify = (request: Request) => Promise<Identity>;

/** Today's member check, in the route's own operation. */
export interface MemberCheck {
  /** For a read: the member, or the denial a read answers. */
  read(ctx: QueryContext, identity: Identity): Promise<Verified | Denial>;
  /** For a command: the member the website admits, or the denial a command answers. */
  command(ctx: MutationContext, identity: Identity): Promise<Verified | Denial>;
}

export interface TransportOptions {
  operations: Operations;
  log: Log;
  /** What `GET /api/live` streams to the members who follow it. */
  live: LiveFeed;
  routes: readonly Route[];
  identify: Identify;
  check: MemberCheck;
  /** The page load that signs the person in, run by `POST /api/entry` in one command of its own. */
  enter: Enter;
}

/** Runs a person's entry: their sign-in effects when they're due, or the denial that writes nothing. */
export type Enter = (ctx: MutationContext, identity: Identity) => Promise<{ kind: "entered" } | Denial>;

// The entry takes no arguments, and refuses any it is sent, as a route without arguments does.
const noArguments = z.strictObject({});

/** The API's routes. Two routes of one name stop the service at boot. */
export function apiTransport({ operations, log, live, routes, identify, check, enter }: TransportOptions): Hono {
  const reads = new Map<string, Route>();
  const commands = new Map<string, Route>();
  for (const route of routes) {
    const table = route.kind === "query" ? reads : commands;
    if (reads.has(route.name) || commands.has(route.name)) throw new Error(`Two website routes are named ${route.name}`);
    table.set(route.name, route);
  }

  const api = new Hono();
  const limited = bodyLimit({ maxSize: maxBodyBytes, onError: (c) => c.json({ error: "the request is too large" }, 413, { "cache-control": "no-store" }) });
  api.post("/api/query/:name", limited, (c) => answer(c, reads.get(c.req.param("name"))));
  api.post("/api/mutation/:name", limited, (c) => answer(c, commands.get(c.req.param("name"))));
  api.post("/api/entry", limited, entry);
  api.get("/api/live", follow);
  // Every other API path, and any other method on these, is no route: never the website's page.
  api.all("/api", (c) => c.json({ error: "no such route" }, 404));
  api.all("/api/*", (c) => c.json({ error: "no such route" }, 404));
  return api;

  async function answer(c: Context, route: Route | undefined): Promise<Response> {
    if (route === undefined) return refused(c, 404, "no such route");
    const args = await argumentsOf(c, route.args);
    if (args instanceof Response) return args;
    const identity = await identify(c.req.raw);
    // Set where the check denies, never read off the result: a handler may answer `{ kind: "closed" }` itself.
    let denied: Denial | undefined;
    const result =
      route.kind === "query"
        ? await operations.query(route.name, async (ctx) => {
            const verified = await check.read(ctx, identity);
            if ("kind" in verified) return (denied = verified);
            return route.handler(ctx, verified.me, args.data);
          })
        : await operations.mutation(route.name, async (ctx) => {
            const verified = await check.command(ctx, identity);
            if ("kind" in verified) return (denied = verified);
            return route.handler(ctx, verified.me, verified.person as HomeMember, args.data);
          });
    if (denied) log.info("website request denied", { route: route.name, denial: denied.kind });
    // Convex answered a function that returned nothing with null.
    return c.json(result === undefined ? null : result, 200, { "cache-control": "no-store" });
  }

  async function entry(c: Context): Promise<Response> {
    const args = await argumentsOf(c, noArguments);
    if (args instanceof Response) return args;
    const identity = await identify(c.req.raw);
    const result = await operations.mutation("website.entry", (ctx) => enter(ctx, identity));
    if (result.kind !== "entered") log.info("website request denied", { route: "website.entry", denial: result.kind });
    return c.json(result, 200, { "cache-control": "no-store" });
  }

  async function follow(c: Context): Promise<Response> {
    if (crossSite(c)) return refused(c, 403, "not a request of the website's own");
    const identity = await identify(c.req.raw);
    const verified = await operations.query("website.live", (ctx) => check.read(ctx, identity));
    if (!("kind" in verified)) return new Response(liveStream(live), { headers: liveStreamHeaders });
    log.info("website request denied", { route: "website.live", denial: verified.kind });
    return c.json(verified, 200, { "cache-control": "no-store" });
  }
}

// The request's arguments as the shape passed them, or the refusal: a request of another site's, or arguments that
// don't fit. Nobody is looked up before this passes.
async function argumentsOf(c: Context, shape: z.ZodType): Promise<Response | { data: never }> {
  if (c.req.header(apiHeader) !== "1" || !isJson(c.req.header("content-type")) || crossSite(c)) return refused(c, 403, "not a request of the website's own");
  const body: unknown = await c.req.json().catch(() => undefined);
  const args = shape.safeParse(body);
  if (!args.success) return refused(c, 400, "the arguments don't fit the route");
  return { data: args.data as never };
}

function crossSite(c: Context): boolean {
  return c.req.header("sec-fetch-site") === "cross-site";
}

function refused(c: Context, status: 400 | 403 | 404, error: string): Response {
  return c.json({ error }, status, { "cache-control": "no-store" });
}

function isJson(contentType: string | undefined): boolean {
  return /^application\/json\s*(;|$)/i.test(contentType ?? "");
}
