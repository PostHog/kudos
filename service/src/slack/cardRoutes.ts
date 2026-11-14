// GET /cards/:id: a stored file's bytes to anyone, as Convex's storage URLs served them, so Slack can fetch a card's
// picture. A file never changes under its ID, so it is cached for good. Only pictures are stored today, and whatever
// else might be is served in a sandbox, so no stored file can run as a page of the site.
import { Hono } from "hono";
import { fileOf } from "../db/files.ts";
import type { Routes } from "../registration.ts";

const forGood = "public, max-age=31536000, immutable";

export const cardRoutes: Routes = ({ operations }) => {
  const routes = new Hono();
  routes.get("/cards/:id", async (c) => {
    const id = c.req.param("id");
    const file = await operations.query("slack.cardRoutes.file", (ctx) => fileOf(ctx, id));
    if (file === null) return c.text("Not Found", 404);
    const headers = {
      "content-type": file.contentType ?? "application/octet-stream",
      "content-length": String(file.size),
      "cache-control": forGood,
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    };
    return new Response(c.req.method === "HEAD" ? null : new Uint8Array(file.bytes), { status: 200, headers });
  });
  return routes;
};
