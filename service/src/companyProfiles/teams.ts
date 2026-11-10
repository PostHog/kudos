// The module map's skeleton of convex/companyProfiles/teams.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { crestNamed } from "../album/hoggies/catalogue.ts";
import type { Doc } from "../db/schema/index.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type TeamCrestArt = { kind: "crest"; slug: string } | { kind: "image"; url: string } | null;

export type CompanyTeam = { team: string; name: string; crest: TeamCrestArt; leads: number[]; people: number[] };

export async function companyTeamsOf(ctx: QueryContext): Promise<CompanyTeam[]> {
  throw notPorted("companyProfiles.teams.companyTeamsOf");
}

export async function crestImagesOf(ctx: QueryContext): Promise<Map<string, string | undefined>> {
  throw notPorted("companyProfiles.teams.crestImagesOf");
}

export function crestArtOf(team: string, crestImage: Doc<"companyTeams">["crestImage"]): TeamCrestArt {
  if (crestNamed(team) !== undefined) return { kind: "crest", slug: team };
  return crestImage === undefined ? null : { kind: "image", url: crestImage };
}
