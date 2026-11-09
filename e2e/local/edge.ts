// The stand-in for the hosting edge in front of the rewrite, in the rig only, never in the service or its image. The
// edge signs website members in and passes the member's email to the app in `x-auth-request-email`; it drops any such
// header a client sends. So does this proxy: it forwards every request to the service, and on gated paths adds the
// email of the member the rig signed in, which `signInPath` sets in a cookie of the stand-in's own.
import { createServer, request as forward, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

export type Edge = { url: string; stop: () => Promise<void> };

/** Signs the browser in as `email` and sends it on to `to`, a path of the app. */
export const signInPath = "/_edge/sign-in";

const cookie = "edge-email";
// The paths the edge lets anyone through, as the service lists them; the time seam is the rig's own.
const isPublic = (path: string) => /^\/(healthz|slack\/(events|commands|interactivity)|admin\/load)(\/|$)|^\/(cards|testing)\//.test(path);

export async function startEdge(serviceUrl: string): Promise<Edge> {
  const service = new URL(serviceUrl);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://edge");
    if (url.pathname === signInPath) {
      const to = url.searchParams.get("to") ?? "";
      const email = encodeURIComponent(url.searchParams.get("email") ?? "");
      response.writeHead(302, { location: /^\/(?!\/)/.test(to) ? to : "/", "set-cookie": `${cookie}=${email}; Path=/; HttpOnly; SameSite=Lax` }).end();
      return;
    }
    const headers: IncomingHttpHeaders = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !/^x[-_]auth[-_]request[-_]/.test(name)));
    const email = new RegExp(`(?:^|;\\s*)${cookie}=([^;]+)`).exec(request.headers.cookie ?? "")?.[1];
    if (email && !isPublic(url.pathname)) headers["x-auth-request-email"] = decodeURIComponent(email);
    const upstream = forward({ hostname: service.hostname, port: service.port, method: request.method, path: request.url, headers }, (answer) => {
      response.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(response);
    });
    upstream.on("error", (failure) => response.headersSent ? response.destroy(failure) : response.writeHead(502).end(String(failure)));
    request.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    stop: () => new Promise((resolve) => (server.closeAllConnections(), server.close(() => resolve()))),
  };
}
