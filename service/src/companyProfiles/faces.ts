// The module map's skeleton of convex/companyProfiles/faces.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

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
  throw notPorted("companyProfiles.faces.companyFaceOf");
}
