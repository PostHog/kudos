// Ports convex/website/hosting.test.ts: the website's files as the service serves them, through the whole app.
// Today's policy names the Convex deployment in connect-src; the service answers the website's API from its own origin,
// so the rewrite's policy names none, and `'self'` covers the API.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { signingSecret } from "../../testing/signedSlack.ts";
import { configuredHost } from "../analytics/browser.ts";
import { createClock } from "../clock.ts";
import { createApp } from "../http/app.ts";
import { jsonLog } from "../log.ts";
import { createFrontDoor } from "../slack/frontDoor.ts";
import { contentSecurityPolicy, websiteFiles } from "./hosting.ts";

const deploymentUrl = "https://happy-hog-123.convex.cloud";
const indexHtml = "<!doctype html><title>HedgeHug</title>";
const script = "console.log('hedgehug');";

let site: string;

beforeEach(() => {
  site = mkdtempSync(join(tmpdir(), "hedgehug-website-"));
});

afterEach(() => {
  rmSync(site, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function aBuiltSite() {
  mkdirSync(join(site, "assets"));
  mkdirSync(join(site, "share"));
  writeFileSync(join(site, "index.html"), indexHtml);
  writeFileSync(join(site, "assets", "index-abc12345.js"), script);
  writeFileSync(join(site, "assets", "index-abc12345.js.map"), "{}");
  writeFileSync(join(site, "favicon.svg"), "<svg/>");
  writeFileSync(join(site, "share", "rocket.png"), "png");
}

function appServing({ dir = site, off = false } = {}) {
  const log = jsonLog(() => {});
  const clock = createClock();
  return createApp({
    commit: "0123abc",
    readiness: { migrations: () => "done" },
    off,
    log,
    clock,
    slack: createFrontDoor({ signingSecret, clock, off, log, handlers: {} }),
    website: websiteFiles({ dir, postHogHost: () => configuredHost() ?? undefined }),
  });
}

function cspOf(response: Response) {
  const header = response.headers.get("Content-Security-Policy") ?? "";
  return new Map(
    header
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );
}

describe("WS26: the static catch-all comes after Slack's routes", () => {
  test("an unsigned POST /slack/events still gets 401", async () => {
    aBuiltSite();

    const response = await appServing().request("/slack/events", { method: "POST", body: "{}" });

    expect(response.status).toBe(401);
  });

  test("an unsigned POST /slack/commands still gets 401", async () => {
    aBuiltSite();

    const response = await appServing().request("/slack/commands", { method: "POST", body: "command=%2Fhedgehug" });

    expect(response.status).toBe(401);
  });
});

const uploadedSlackPhotos = "https://avatars.slack-edge.com";
const gravatarPhotos = "https://secure.gravatar.com";
const customEmojiPictures = ["https://emoji.slack-edge.com", "https://a.slack-edge.com"];
const slackPictureHosts = [uploadedSlackPhotos, gravatarPhotos, ...customEmojiPictures];

describe("WS25: every HTML response carries the strict Content Security Policy header", () => {
  test("GET / answers HTML with the policy", async () => {
    aBuiltSite();

    const response = await appServing().request("/", { method: "GET" });

    expect(response.headers.get("Content-Type")).toMatch(/^text\/html/);
    const csp = cspOf(response);
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("script-src")).toEqual(["'self'"]);
    expect(csp.get("style-src")).toEqual(["'self'"]);
    expect(csp.get("connect-src"), "the API answers from the page's own origin").toEqual(["'self'"]);
    expect(csp.get("img-src")).toEqual(["'self'", ...slackPictureHosts, "https://res.cloudinary.com"]);
    expect(csp.get("font-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  });

  test("a deep SPA path like /profile answers the published index.html with the same policy as /", async () => {
    aBuiltSite();
    const app = appServing();

    const root = await app.request("/", { method: "GET" });
    const deepPath = await app.request("/profile", { method: "GET" });

    expect(deepPath.status).toBe(200);
    expect(deepPath.headers.get("Content-Type")).toMatch(/^text\/html/);
    expect(await deepPath.text()).toContain("<title>HedgeHug</title>");
    expect(cspOf(deepPath).get("default-src")).toEqual(["'self'"]);
    expect(deepPath.headers.get("Content-Security-Policy")).toBe(root.headers.get("Content-Security-Policy"));
  });

  test("a response that isn't HTML gets no policy", async () => {
    const response = await appServing().request("/assets/index-abc12345.js", { method: "GET" });

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });
});

const todaysPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `connect-src 'self' ${deploymentUrl} wss://happy-hog-123.convex.cloud`,
  `img-src 'self' ${slackPictureHosts.join(" ")} https://res.cloudinary.com`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const sameOriginPolicy = todaysPolicy.replace(` ${deploymentUrl} wss://happy-hog-123.convex.cloud`, "");

describe("the website runs only its own code", () => {
  test("without POSTHOG_HOST the policy is today's", () => {
    expect(contentSecurityPolicy(deploymentUrl, undefined)).toBe(todaysPolicy);
    expect(contentSecurityPolicy(deploymentUrl, "")).toBe(todaysPolicy);
  });

  test("PostHog's US host widens connect-src by the host and its assets host, and nothing else", () => {
    expect(contentSecurityPolicy(deploymentUrl, "https://us.i.posthog.com")).toBe(
      todaysPolicy.replace("wss://happy-hog-123.convex.cloud", "wss://happy-hog-123.convex.cloud https://us.i.posthog.com https://us-assets.i.posthog.com"),
    );
  });

  test("PostHog's EU host widens connect-src by the host and its assets host", () => {
    expect(contentSecurityPolicy(deploymentUrl, "https://eu.i.posthog.com")).toBe(
      todaysPolicy.replace("wss://happy-hog-123.convex.cloud", "wss://happy-hog-123.convex.cloud https://eu.i.posthog.com https://eu-assets.i.posthog.com"),
    );
  });

  test("a host of its own serves its own assets, so connect-src adds only that host", () => {
    expect(contentSecurityPolicy(deploymentUrl, "https://e.example.com/")).toBe(todaysPolicy.replace("wss://happy-hog-123.convex.cloud", "wss://happy-hog-123.convex.cloud https://e.example.com"));
  });

  test("an HTML response under a POSTHOG_HOST that isn't a URL is served with today's policy", async () => {
    vi.stubEnv("POSTHOG_HOST", "us.i.posthog.com");
    aBuiltSite();

    const response = await appServing().request("/", { method: "GET" });

    expect(response.headers.get("Content-Security-Policy")).toBe(sameOriginPolicy);
  });

  test("every HTML response carries the policy for the configured POSTHOG_HOST", async () => {
    vi.stubEnv("POSTHOG_HOST", "https://us.i.posthog.com");
    aBuiltSite();

    const response = await appServing().request("/", { method: "GET" });

    expect(response.headers.get("Content-Security-Policy")).toBe(contentSecurityPolicy(undefined, "https://us.i.posthog.com"));
    expect(cspOf(response).get("connect-src")).toEqual(["'self'", "https://us.i.posthog.com", "https://us-assets.i.posthog.com"]);
    expect(cspOf(response).has("report-uri")).toBe(false);
    expect(cspOf(response).has("report-to")).toBe(false);
  });
});

describe("the website's files keep today's cache headers", () => {
  test("a built asset under /assets is cached for good and served with its type", async () => {
    aBuiltSite();

    const response = await appServing().request("/assets/index-abc12345.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe(script);
  });

  test("the page and a file without a hash in its name are checked again on every visit", async () => {
    aBuiltSite();
    const app = appServing();

    for (const path of ["/", "/index.html", "/leaderboard", "/favicon.svg", "/share/rocket.png"]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("Cache-Control"), path).toBe("public, max-age=0, must-revalidate");
    }
  });

  test("a file the browser already holds answers 304 with its ETag, and no body", async () => {
    aBuiltSite();
    const app = appServing();
    const first = await app.request("/assets/index-abc12345.js");
    const etag = first.headers.get("ETag")!;

    const again = await app.request("/assets/index-abc12345.js", { headers: { "If-None-Match": `W/${etag}` } });

    expect(again.status).toBe(304);
    expect(again.headers.get("ETag")).toBe(etag);
    expect(again.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(await again.text()).toBe("");
  });

  test("a changed file gets a new ETag", async () => {
    aBuiltSite();
    const before = (await appServing().request("/favicon.svg")).headers.get("ETag");
    writeFileSync(join(site, "favicon.svg"), "<svg></svg>");

    const after = (await appServing().request("/favicon.svg")).headers.get("ETag");

    expect(after).not.toBe(before);
  });
});

describe("only the website's own files answer", () => {
  test("a path with a file extension that names no file answers 404, never the page", async () => {
    aBuiltSite();

    const response = await appServing().request("/assets/missing-abc12345.js");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  test("an API path the app doesn't answer is a 404, never the page", async () => {
    aBuiltSite();
    const app = appServing();

    for (const path of ["/api", "/api/", "/api/query/nothing", "/api/live"]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("Content-Type") ?? "", path).not.toMatch(/^text\/html/);
    }
  });

  test("a path that climbs out of the build or names a file by an escape reaches nothing outside it", async () => {
    aBuiltSite();
    writeFileSync(join(site, "..", `${site.split("/").pop()}-secret.txt`), "secret");
    const app = appServing();

    for (const path of ["/%2e%2e/secret.txt", "/assets/%2e%2e%2f%2e%2e%2fsecret.txt", "/..%2fsecret.txt"]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).not.toContain("secret");
    }
    rmSync(join(site, "..", `${site.split("/").pop()}-secret.txt`));
  });

  test("a malformed escape is a bad request", async () => {
    aBuiltSite();

    const response = await appServing().request("/%E0%A4%A");

    expect(response.status).toBe(400);
  });

  test("a POST to a page is no route", async () => {
    aBuiltSite();

    expect((await appServing().request("/", { method: "POST" })).status).toBe(404);
  });

  test("HEAD answers the page's headers without its body", async () => {
    aBuiltSite();

    const response = await appServing().request("/", { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toBe(sameOriginPolicy);
    expect(await response.text()).toBe("");
  });

  test("a copy without a website build answers its pages 503, to try again", async () => {
    const app = appServing({ dir: join(site, "not-built") });

    const response = await app.request("/leaderboard");

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("while HEDGEHUG_OFF is set the website answers 503", async () => {
    aBuiltSite();

    expect((await appServing({ off: true }).request("/")).status).toBe(503);
  });
});
