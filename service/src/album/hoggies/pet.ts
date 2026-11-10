// A member's pet hoggie, as today's convex/album/hoggies/pet.ts: one of the hoggies they own, one row per member in a
// workspace, and every pet in the workspace for the website's pages.
import { and, eq } from "drizzle-orm";
import { toDocument } from "../../db/documents.ts";
import { indexOrder } from "../../db/indexOrder.ts";
import { petHoggies, type Doc } from "../../db/schema/index.ts";
import { unique } from "../../db/unique.ts";
import type { MutationContext, QueryContext, Transaction } from "../../operations.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { hoggieNamed, type Rarity } from "./catalogue.ts";
import { tallyOf } from "./drops.ts";

export type Pet = { person: MemberId; hoggie: string; name: string; rarity: Rarity };

export type PetOwner = { workspace: string; member: MemberId };

export async function makePetOf(ctx: MutationContext, { workspace, member }: PetOwner, hoggie: string): Promise<string | null> {
  if (!(await owns(ctx, member, hoggie))) return null;
  const row = await petRowOf(ctx.tx, workspace, member);
  if (row === null) await ctx.tx.insert(petHoggies).values({ ...ctx.newRow(), workspace, member, hoggie });
  else if (row.hoggie !== hoggie) await ctx.tx.update(petHoggies).set({ hoggie }).where(eq(petHoggies._id, row._id));
  return hoggie;
}

export async function petOf({ tx }: QueryContext, { workspace, member }: PetOwner): Promise<string | null> {
  return (await petRowOf(tx, workspace, member))?.hoggie ?? null;
}

// Every pet in the workspace in `by_workspace_member` order, as Convex collected it.
export async function petsIn({ tx }: QueryContext, workspace: string): Promise<Pet[]> {
  const rows = await tx
    .select()
    .from(petHoggies)
    .where(eq(petHoggies.workspace, workspace))
    .orderBy(...indexOrder(petHoggies, ["workspace", "member"]).orderBy());
  return rows.flatMap(({ member, hoggie }) => petShownOf(member, hoggie));
}

function petShownOf(member: MemberId, hoggie: string): Pet[] {
  const entry = hoggieNamed(hoggie);
  return entry === undefined ? [] : [{ person: member, hoggie, name: entry.name, rarity: entry.rarity }];
}

async function owns(ctx: QueryContext, member: MemberId, hoggie: string) {
  return hoggieNamed(hoggie) !== undefined && (await tallyOf(ctx, member, hoggie)) !== null;
}

async function petRowOf(tx: Transaction, workspace: string, member: MemberId): Promise<Doc<"petHoggies"> | null> {
  const rows = await tx.select().from(petHoggies).where(and(eq(petHoggies.workspace, workspace), eq(petHoggies.member, member))).limit(2);
  const row = unique("petHoggies", rows);
  return row === null ? null : toDocument<Doc<"petHoggies">>(petHoggies, row);
}
