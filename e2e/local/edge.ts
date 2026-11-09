// The stand-in for the hosting edge in front of the rewrite, in the rig only, never in the service or its image. The
// edge signs website members in and passes the member's email to the app in `x-auth-request-email`; it drops any such
// header a client sends. So does this proxy: it forwards every request to the service, and on gated paths adds the
// email of the member the rig signed in, which `signInPath` sets in a cookie of the stand-in's own.
//
// Test machinery only: the cookie is unsigned and `signInPath` signs anyone in as anyone, so it proves neither who a
// member is nor that they belong to the workspace. The service must never trust it outside the rig.
import { createServer, request as forward, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

export type Edge = { url: string; stop: () => Promise<void> };

/** Signs the browser in as `email` and sends it on to `to`, a path of the app. */
export const signInPath = "/_edge/sign-in";

const cookie = "edge-email";
const origin = "http://edge";
const email = /^[^\s@;,"\\<>()\x00-\x1f\x7f]+@[^\s@;,"\\<>()\x00-\x1f\x7f]+$/;
// The paths the edge lets anyone through, as the service lists them; the time seam is the rig's own.
const isPublic = (path: string) => /^\/(healthz|slack\/(events|commands|interactivity)|admin\/load)(\/|$)|^\/(cards|testing)\//.test(path);

/**
 * The request's target as the service will route it: dot segments resolved, as the service's server resolves them,
 * and the path decoded as its router decodes it (`%2F` and `%25` kept). Null for anything else, which the edge refuses:
 * an absolute or scheme-relative target, or a malformed escape.
 */
function routed(target: string): { forwarded: string; path: string } | null {
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  const url = new URL(target, origin);
  if (url.origin !== origin) return null;
  try {
    return { forwarded: `${url.pathname}${url.search}`, path: decodeURI(url.pathname.replace(/%25/g, "%2525")) };
  } catch {
    return null;
  }
}

/** The app path `to` names, or `/`: never another origin, however a browser would read it. */
function appPath(to: string): string {
  if (!to.startsWith("/") || /[\\\x00-\x20\x7f]/.test(to)) return "/";
  const url = new URL(to, origin);
  return url.origin === origin && !url.pathname.startsWith("//") ? `${url.pathname}${url.search}${url.hash}` : "/";
}

function signedInEmail(cookies: string | undefined): string | undefined {
  const value = new RegExp(`(?:^|;\\s*)${cookie}=([^;]+)`).exec(cookies ?? "")?.[1];
  if (value === undefined) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return email.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export async function startEdge(serviceUrl: string): Promise<Edge> {
  const service = new URL(serviceUrl);
  const server = createServer((request, response) => {
    try {
      const target = routed(request.url ?? "/");
      if (target === null) {
        response.writeHead(400).end();
        return;
      }
      if (target.path === signInPath) {
        const url = new URL(target.forwarded, origin);
        const member = url.searchParams.get("email") ?? "";
        if (!email.test(member)) {
          response.writeHead(400).end();
          return;
        }
        const to = appPath(url.searchParams.get("to") ?? "");
        response.writeHead(302, { location: to, "set-cookie": `${cookie}=${encodeURIComponent(member)}; Path=/; HttpOnly; SameSite=Lax` }).end();
        return;
      }
      const headers: IncomingHttpHeaders = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !/^x[-_]auth[-_]request[-_]/.test(name)));
      const member = signedInEmail(request.headers.cookie);
      if (member !== undefined && !isPublic(target.path)) headers["x-auth-request-email"] = member;
      const upstream = forward({ hostname: service.hostname, port: service.port, method: request.method, path: target.forwarded, headers }, (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      });
      upstream.on("error", (failure) => (response.headersSent ? response.destroy(failure) : response.writeHead(502).end()));
      // A client that goes away mid-request takes its forwarded request with it, so the service is never left waiting.
      response.on("close", () => upstream.destroy());
      request.pipe(upstream);
    } catch (failure) {
      console.error("the edge stand-in failed a request", failure);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    stop: () => new Promise((resolve) => (server.closeAllConnections(), server.close(() => resolve()))),
  };
}
