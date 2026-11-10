// The company's teams as the last sync kept them, as today's convex/companyProfiles/teams.ts.
import type { Doc } from "../db/schema/index.ts";
import { asc } from "drizzle-orm";
import { toDocument } from "../db/documents.ts";
import { companyTeams } from "../db/schema/companyProfiles.ts";
import type { QueryContext } from "../operations.ts";
import { crestNamed } from "../album/hoggies/catalogue.ts";

export type TeamCrestArt = { kind: "crest"; slug: string } | { kind: "image"; url: string } | null;

export type CompanyTeam = { team: string; name: string; crest: TeamCrestArt; leads: number[]; people: number[] };

export async function companyTeamsOf(ctx: QueryContext): Promise<CompanyTeam[]> {
  const teams = await teamRows(ctx);
  return teams.map(({ team, name, crestImage, leads, people }) => ({ team, name, crest: crestArtOf(team, crestImage), leads, people }));
}

export async function crestImagesOf(ctx: QueryContext): Promise<Map<string, string | undefined>> {
  return new Map((await teamRows(ctx)).map(({ team, crestImage }) => [team, crestImage]));
}

export function crestArtOf(team: string, crestImage: Doc<"companyTeams">["crestImage"]): TeamCrestArt {
  if (crestNamed(team) !== undefined) return { kind: "crest", slug: team };
  return crestImage === undefined ? null : { kind: "image", url: crestImage };
}

// Convex's `.query("companyTeams").collect()`: every team in creation order.
async function teamRows(ctx: QueryContext): Promise<Array<Doc<"companyTeams">>> {
  const rows = await ctx.tx.select().from(companyTeams).orderBy(asc(companyTeams._creationTime), asc(companyTeams._id));
  return rows.map((row) => toDocument<Doc<"companyTeams">>(companyTeams, row));
}
