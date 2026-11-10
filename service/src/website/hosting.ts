// The website's built files, served as today's static hosting serves them: `/` and every path without a file extension
// that names no file answer `index.html` (the single-page app routes them), a missing file answers 404, every HTML
// answer carries the strict Content Security Policy, and the bundler's hashed files under `/assets/` are cached for good.
// The files are the build's output folder, read once on the first request; a request only ever picks one of them by
// name, so no path a client sends reaches the file system.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";

const slackPictures = ["https://avatars.slack-edge.com", "https://secure.gravatar.com", "https://emoji.slack-edge.com", "https://a.slack-edge.com"].join(" ");
const companyProfileImages = "https://res.cloudinary.com";
// The bundler's output, named `<name>-<hash of its content>.<extension>`: the only files a browser may keep for good.
const builtAsset = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9]+)+$/;
const immutable = "public, max-age=31536000, immutable";
const revalidate = "public, max-age=0, must-revalidate";
// The website's API answers its own paths; a page address never starts with them.
const apiPaths = /^\/api(\/|$)/;

export interface WebsiteFilesOptions {
  /** The website build's output folder. */
  dir: string;
  /** PostHog's host for the browser's analytics, which the policy lets the page reach; read on every HTML answer. */
  postHogHost: () => string | undefined;
}

type File = { address: string; path: string; size: number; etag: string; contentType: string };

/** The website's routes: GET (and so HEAD) on every path, mounted after every other route of the app. */
export function websiteFiles({ dir, postHogHost }: WebsiteFilesOptions): Hono {
  let built: Promise<Map<string, File>> | undefined;
  const files = () => (built ??= filesIn(dir).catch((error: unknown) => ((built = undefined), Promise.reject(error))));
  const site = new Hono();
  site.get("*", async (c) => {
    const decoded = decodedPath(new URL(c.req.url).pathname);
    if (decoded === null) return text("Bad Request", 400);
    // Checked on the decoded path, so no escape (`/api%2Flive`, `/%61pi`) makes an API path the page.
    if (apiPaths.test(decoded)) return c.notFound();
    const path = decoded === "" || decoded === "/" ? "/index.html" : decoded;
    const all = await files();
    const file = all.get(path) ?? (hasFileExtension(path) ? undefined : all.get("/index.html"));
    if (file === undefined) {
      // A copy whose image holds no website build: today's hosting answers the same before the first upload.
      if (path === "/index.html" || !hasFileExtension(path)) return new Response("The website isn't built into this copy.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "5" } });
      return text("Not Found", 404);
    }
    // Chosen by the file served, never the address asked: the page answered for a missing `/assets/…` is still the page.
    const headers = new Headers({ "cache-control": cacheControlOf(file), etag: file.etag });
    // A 304 carries the policy too, so a browser revalidating a page it holds gets today's, not the one it cached.
    if (isHtml(file.contentType)) headers.set("content-security-policy", contentSecurityPolicy(undefined, postHogHost()));
    if (etagMatches(c.req.header("if-none-match"), file.etag)) return new Response(null, { status: 304, headers });
    headers.set("content-type", file.contentType);
    headers.set("content-length", String(file.size));
    headers.set("x-content-type-options", "nosniff");
    const body = c.req.method === "HEAD" ? null : (Readable.toWeb(createReadStream(file.path)) as ReadableStream<Uint8Array>);
    return new Response(body, { status: 200, headers });
  });
  return site;
}

/** Every regular file under `dir` by its address, `/` and forward slashes; none when the folder doesn't exist. */
async function filesIn(dir: string): Promise<Map<string, File>> {
  const files = new Map<string, File>();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    // Only regular files: a link could point outside the build.
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const address = `/${relative(dir, path).split(sep).join("/")}`;
    const [contents, { size }] = await Promise.all([readFile(path), stat(path)]);
    files.set(address, { address, path, size, etag: `"${createHash("sha256").update(contents).digest("base64url")}"`, contentType: contentTypeOf(address) });
  }
  return files;
}

function decodedPath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

function isHtml(contentType: string) {
  return contentType.startsWith("text/html");
}

// Today's static hosting's types, by the file's extension.
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
};

function contentTypeOf(path: string) {
  return contentTypes[path.substring(path.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";
}

function hasFileExtension(path: string) {
  const lastSegment = path.split("/").pop() ?? "";
  return lastSegment.includes(".") && !lastSegment.startsWith(".");
}

function isHashedAsset(path: string) {
  const match = /[-.]([\dA-Za-z_-]{6,32})\.[A-Za-z\d]+$/.exec(path);
  return match !== null && /[\d_-]/.test(match[1]!);
}

function cacheControlOf(file: File) {
  if (isHtml(file.contentType)) return revalidate;
  return builtAsset.test(file.address) || (!file.address.startsWith("/assets/") && isHashedAsset(file.address)) ? immutable : revalidate;
}

function etagMatches(ifNoneMatch: string | undefined, current: string) {
  if (!ifNoneMatch) return false;
  const normalize = (value: string) => value.trim().replace(/^W\//, "").trim();
  return ifNoneMatch.split(",").some((candidate) => normalize(candidate) === "*" || normalize(candidate) === normalize(current));
}

export function contentSecurityPolicy(deploymentUrl: string | undefined, postHogHost: string | undefined) {
  const deployment = deploymentUrl ? [deploymentUrl, socketUrlOf(deploymentUrl)] : [];
  const postHog = postHogHost ? postHogOriginsOf(postHogHost) : [];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `connect-src ${["'self'", ...deployment, ...postHog].join(" ")}`,
    `img-src 'self' ${slackPictures} ${companyProfileImages}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function socketUrlOf(deploymentUrl: string) {
  return deploymentUrl.replace(/^http/, "ws");
}

const postHogCloud = /^https:\/\/(us|eu)\.i\.posthog\.com$/;

function postHogOriginsOf(host: string) {
  const origin = new URL(host).origin;
  const region = postHogCloud.exec(origin)?.[1];
  return region === undefined ? [origin] : [origin, `https://${region}-assets.i.posthog.com`];
}
