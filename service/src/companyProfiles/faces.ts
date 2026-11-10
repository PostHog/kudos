// A member's company face by their real name, as today's convex/companyProfiles/faces.ts.
import { asc, eq } from "drizzle-orm";
import { companyProfiles } from "../db/schema/companyProfiles.ts";
import type { QueryContext } from "../operations.ts";

export type CompanyFace = { image: string; colour: string };

export function companyFaceOfProfile({ image, colour }: { image?: string; colour: string }): CompanyFace | null {
  return image === undefined ? null : { image, colour };
}

export function normalisedName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "")
    .join(" ");
}

export async function companyFaceOf(ctx: QueryContext, realName: string): Promise<CompanyFace | undefined> {
  const name = normalisedName(realName);
  if (name === "") return undefined;
  const matches = await ctx.tx
    .select({ image: companyProfiles.image, colour: companyProfiles.colour })
    .from(companyProfiles)
    .where(eq(companyProfiles.normalisedName, name))
    .orderBy(asc(companyProfiles._creationTime), asc(companyProfiles._id))
    .limit(2);
  const [only] = matches;
  if (only?.image == null || matches.length !== 1) return undefined;
  return { image: only.image, colour: only.colour };
}
