// Stored files, as Convex's `_storage` kept them: one `files` row each, the document's fields beside its bytes, and an
// address on the service's public `/cards/:id` path standing in for `ctx.storage.getUrl`. A loaded file keeps its ID, so
// the address of every file carried over is its ID on the new host.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { Id } from "./columns.ts";
import { files } from "./schema/service.ts";

export type StoredFile = { bytes: Buffer; size: number; contentType: string | null };

/** `ctx.storage.store`: keeps the bytes, with the sha256 Convex keeps (base64) and the content type when there is one. */
export async function storedFile(ctx: MutationContext, bytes: Uint8Array, contentType: string | null): Promise<Id<"_storage">> {
  const { _id, _creationTime } = ctx.newRow();
  const sha256 = createHash("sha256").update(bytes).digest("base64");
  await ctx.tx.insert(files).values({ _id, _creationTime, sha256, size: bytes.byteLength, contentType, bytes: Buffer.from(bytes) });
  return _id as Id<"_storage">;
}

/** `ctx.storage.delete`. */
export async function deleteFile(ctx: MutationContext, file: Id<"_storage">): Promise<void> {
  await ctx.tx.delete(files).where(eq(files._id, file));
}

/** `ctx.storage.getUrl`: the file's public address, or null when there is no such file or the site has no address. */
export async function fileUrlOf(ctx: QueryContext, file: Id<"_storage">): Promise<string | null> {
  const site = siteUrl();
  if (site === null) return null;
  const [found] = await ctx.tx.select({ _id: files._id }).from(files).where(eq(files._id, file)).limit(1);
  return found === undefined ? null : `${site}/cards/${encodeURIComponent(found._id)}`;
}

/** The file `/cards/:id` serves, or null. */
export async function fileOf(ctx: QueryContext, file: string): Promise<StoredFile | null> {
  const [found] = await ctx.tx.select({ bytes: files.bytes, size: files.size, contentType: files.contentType }).from(files).where(eq(files._id, file)).limit(1);
  return found ?? null;
}

function siteUrl(): string | null {
  const site = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
  return site === "" ? null : site;
}
