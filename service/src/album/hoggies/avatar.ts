// A member's hoggie avatar, as today's convex/album/hoggies/avatar.ts: one of the hoggies they hold, one row per member,
// shown only where both the viewer and the member see avatars.
import { eq } from "drizzle-orm";
import { toDocument } from "../../db/documents.ts";
import { hoggieAvatars, type Doc } from "../../db/schema/index.ts";
import type { MutationContext, QueryContext, Transaction } from "../../operations.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { catalogue, hoggieNamed, type CatalogueHoggie, type Rarity } from "./catalogue.ts";
import { talliesOf } from "./collection.ts";
import { tallyOf, type HoggieArt } from "./drops.ts";
import { avatarOpenFor, avatarShownTo } from "./flag.ts";

export type Avatar = { hoggie: string; name: string; rarity: Rarity; art: HoggieArt };

export type AvatarShown = { avatar?: Avatar | null };

export type AvatarChoice = { avatar: Avatar | null; held: Avatar[] };

export async function setAvatar(ctx: MutationContext, member: MemberId, hoggie: string | null): Promise<void> {
  if (!(await avatarOpenFor(ctx, member))) return;
  if (hoggie !== null && !(await holds(ctx, member, hoggie))) return;
  const row = await avatarRowOf(ctx.tx, member);
  if (hoggie === null) {
    if (row !== null) await ctx.tx.delete(hoggieAvatars).where(eq(hoggieAvatars._id, row._id));
  } else if (row === null) await ctx.tx.insert(hoggieAvatars).values({ ...ctx.newRow(), member, hoggie });
  else if (row.hoggie !== hoggie) await ctx.tx.update(hoggieAvatars).set({ hoggie }).where(eq(hoggieAvatars._id, row._id));
}

export async function avatarShownOn(ctx: QueryContext, viewer: MemberId, member: MemberId): Promise<AvatarShown> {
  if (!(await avatarShownTo(ctx, viewer)) || (viewer !== member && !(await avatarShownTo(ctx, member)))) return {};
  return { avatar: await avatarOf(ctx, member) };
}

export async function avatarOf(ctx: QueryContext, member: MemberId): Promise<Avatar | null> {
  const row = await avatarRowOf(ctx.tx, member);
  const entry = row === null ? undefined : hoggieNamed(row.hoggie);
  return entry === undefined ? null : avatarFrom(entry);
}

export async function avatarChoiceOf(ctx: QueryContext, member: MemberId): Promise<AvatarChoice | null> {
  if (!(await avatarShownTo(ctx, member))) return null;
  const tallies = await talliesOf(ctx, member);
  return { avatar: await avatarOf(ctx, member), held: catalogue.hoggies.filter(({ hoggie }) => tallies.has(hoggie)).map(avatarFrom) };
}

function avatarFrom({ hoggie, name, rarity }: CatalogueHoggie): Avatar {
  return { hoggie, name, rarity, art: { kind: "hoggie", slug: hoggie } };
}

async function holds(ctx: QueryContext, member: MemberId, hoggie: string) {
  return hoggieNamed(hoggie) !== undefined && (await tallyOf(ctx, member, hoggie)) !== null;
}

// Convex's `.unique()`: a second avatar row for one member is an error.
async function avatarRowOf(tx: Transaction, member: MemberId): Promise<Doc<"hoggieAvatars"> | null> {
  const rows = await tx.select().from(hoggieAvatars).where(eq(hoggieAvatars.member, member)).limit(2);
  if (rows.length > 1) throw new Error("More than one hoggie avatar is stored for a member");
  return rows[0] === undefined ? null : toDocument<Doc<"hoggieAvatars">>(hoggieAvatars, rows[0]);
}
