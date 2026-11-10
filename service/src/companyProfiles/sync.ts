// The daily read of posthog.com's team pages, as today's convex/companyProfiles/sync.ts: every page is read and checked
// before anything is kept, then the company's profiles and teams are swapped in one transaction, unless a newer read
// already landed, and every workspace's matched faces are kept again.
import type { CompanyTeamsReplacedEvent } from "../bus/events.ts";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { companyProfiles, companyTeams } from "../db/schema/companyProfiles.ts";
import { fromDocument } from "../db/documents.ts";
import { actionJob } from "../jobs/define.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { zv } from "../values.ts";
import { normalisedName } from "./faces.ts";
import { keepCompanyFacesInEveryWorkspaceLater } from "./storedFaces.ts";

const teamPages = "https://better-animal-d658c56969.strapiapp.com/api/teams";
const cloudinaryImages = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+\.png)$/;
const cutoutSize = "c_limit,w_160,f_auto,q_auto/";
const mostPages = 10;

const profileColours: Record<string, string> = {
  blue: "#2F80FA",
  green: "#6AA84F",
  lilac: "#8567FF",
  "lime-green": "#96E5B6",
  orange: "#EB9D2A",
  purple: "#B62AD9",
  red: "#F54E00",
  salmon: "#F35454",
  seagreen: "#30ABC6",
  "sky-blue": "#2EA2D3",
  teal: "#29DBBB",
  yellow: "#F7A501",
};
const neutralColour = "#EEEFE9";

const companyProfile = z.strictObject({
  profile: zv.number(),
  firstName: z.string(),
  lastName: z.string(),
  normalisedName: z.string(),
  image: z.optional(z.string()),
  colour: z.string(),
  teams: z.array(z.string()),
  role: z.optional(z.string()),
});

const companyTeam = z.strictObject({
  team: z.string(),
  name: z.string(),
  crestImage: z.optional(z.string()),
  leads: z.array(zv.number()),
  people: z.array(zv.number()),
});

type CompanyProfile = z.infer<typeof companyProfile>;
type CompanyTeam = z.infer<typeof companyTeam>;

type Read = { kind: "read"; profiles: CompanyProfile[]; teams: CompanyTeam[] } | { kind: "failed"; reason: "unreachable" | "malformed" | "empty" };

export const syncCompanyProfilesArgs = z.strictObject({});
export async function syncCompanyProfiles(ctx: ActionContext, _args: z.infer<typeof syncCompanyProfilesArgs>): Promise<null> {
  const asOf = ctx.clock.now();
  const read = await readTeamPages();
  if (read.kind === "failed") {
    console.warn("companyProfiles.read_failed", { reason: read.reason });
    return null;
  }
  await ctx.run.mutation("companyProfiles.sync.replaceCompanyProfiles", (m) => replaceCompanyProfiles(m, { asOf, profiles: read.profiles, teams: read.teams }));
  return null;
}
export const syncCompanyProfilesJob = actionJob("companyProfiles.sync.syncCompanyProfiles", syncCompanyProfilesArgs, syncCompanyProfiles);

export const replaceCompanyProfilesArgs = z.strictObject({ asOf: zv.number(), profiles: z.array(companyProfile), teams: z.array(companyTeam) });
export async function replaceCompanyProfiles(ctx: MutationContext, { asOf, profiles, teams }: z.infer<typeof replaceCompanyProfilesArgs>): Promise<void> {
  // Convex's `.first()`: the oldest profile row, whose asOf the last swap wrote.
  const [stored] = await ctx.tx.select({ asOf: companyProfiles.asOf }).from(companyProfiles).orderBy(asc(companyProfiles._creationTime), asc(companyProfiles._id)).limit(1);
  if (stored?.asOf != null && asOf < stored.asOf) return;
  await ctx.tx.delete(companyProfiles);
  await ctx.tx.delete(companyTeams);
  for (const profile of profiles) await ctx.tx.insert(companyProfiles).values(fromDocument(companyProfiles, { ...ctx.newRow(), ...profile, asOf }) as typeof companyProfiles.$inferInsert);
  for (const team of teams) await ctx.tx.insert(companyTeams).values(fromDocument(companyTeams, { ...ctx.newRow(), ...team, asOf }) as typeof companyTeams.$inferInsert);
  await keepCompanyFacesInEveryWorkspaceLater(ctx);
  const replaced: CompanyTeamsReplacedEvent = { type: "companyTeamsReplaced", at: asOf };
  await ctx.publish(replaced);
}

async function readTeamPages(): Promise<Read> {
  const teams: Team[] = [];
  let pageCount = 1;
  for (let page = 1; page <= pageCount; page++) {
    const response = await pageOf(page);
    if (response === undefined) return { kind: "failed", reason: "unreachable" };
    const parsed = teamsPage(await response.json().catch(() => undefined));
    if (parsed === undefined || !isConsistent(parsed, page, pageCount)) return { kind: "failed", reason: "malformed" };
    pageCount = parsed.pageCount;
    teams.push(...parsed.teams);
  }
  const profiles = profilesOf(teams);
  return profiles.length === 0 ? { kind: "failed", reason: "empty" } : { kind: "read", profiles, teams: keptTeamsOf(teams) };
}

async function pageOf(page: number): Promise<Response | undefined> {
  const url = new URL(teamPages);
  url.searchParams.set("fields[0]", "slug");
  url.searchParams.set("fields[1]", "name");
  url.searchParams.set("populate[crest][fields][0]", "url");
  url.searchParams.set("populate[leadProfiles][fields][0]", "id");
  url.searchParams.set("populate[profiles][fields][0]", "firstName");
  url.searchParams.set("populate[profiles][fields][1]", "lastName");
  url.searchParams.set("populate[profiles][fields][2]", "color");
  url.searchParams.set("populate[profiles][fields][3]", "companyRole");
  url.searchParams.set("populate[profiles][populate][avatar][fields][0]", "url");
  url.searchParams.set("pagination[pageSize]", "100");
  url.searchParams.set("pagination[page]", String(page));
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return response.ok ? response : undefined;
  } catch {
    return undefined;
  }
}

type TeamProfile = { id: number; firstName: string; lastName: string; colour: unknown; cutout: unknown; role: unknown };
type Team = { slug?: string; name?: string; crest: unknown; leads: number[]; profiles: TeamProfile[] };

type TeamsPage = { teams: Team[]; page: number; pageCount: number };

function teamsPage(body: unknown): TeamsPage | undefined {
  const page = at(body, "meta", "pagination", "page");
  const pageCount = at(body, "meta", "pagination", "pageCount");
  const data = at(body, "data");
  if (typeof page !== "number" || typeof pageCount !== "number" || !Array.isArray(data)) return undefined;
  const teams = data.map(teamOf);
  return teams.every((team) => team !== undefined) ? { teams, page, pageCount } : undefined;
}

function isConsistent(parsed: TeamsPage, page: number, pageCountSoFar: number) {
  const firstPage = page === 1;
  const pageCountHolds = firstPage ? Number.isInteger(parsed.pageCount) && parsed.pageCount >= 1 && parsed.pageCount <= mostPages : parsed.pageCount === pageCountSoFar;
  const teamsHold = parsed.teams.length > 0 || (firstPage && parsed.pageCount === 1);
  return parsed.page === page && pageCountHolds && teamsHold;
}

function teamOf(team: unknown): Team | undefined {
  const slug = at(team, "attributes", "slug");
  const name = at(team, "attributes", "name");
  const leads = idsOf(at(team, "attributes", "leadProfiles", "data"));
  const profiles = at(team, "attributes", "profiles", "data");
  if (!isOptionalText(slug) || !isOptionalText(name) || leads === undefined || !Array.isArray(profiles)) return undefined;
  const parsed = profiles.map(profileOf);
  if (!parsed.every((profile) => profile !== undefined)) return undefined;
  const keptSlug = nonBlank(slug);
  const keptName = nonBlank(name);
  return {
    ...(keptSlug !== undefined && { slug: keptSlug }),
    ...(keptName !== undefined && { name: keptName }),
    crest: at(team, "attributes", "crest", "data", "attributes", "url"),
    leads,
    profiles: parsed,
  };
}

function nonBlank(text: unknown) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}

function isOptionalText(value: unknown) {
  return typeof value === "string" || value === null || value === undefined;
}

function idsOf(entries: unknown): number[] | undefined {
  if (!Array.isArray(entries)) return undefined;
  const ids = entries.map((entry) => at(entry, "id"));
  return ids.every((id) => typeof id === "number") ? ids : undefined;
}

function profileOf(profile: unknown): TeamProfile | undefined {
  const id = at(profile, "id");
  const firstName = at(profile, "attributes", "firstName");
  const lastName = at(profile, "attributes", "lastName");
  if (typeof id !== "number" || typeof firstName !== "string" || typeof lastName !== "string") return undefined;
  return {
    id,
    firstName,
    lastName,
    colour: at(profile, "attributes", "color"),
    cutout: at(profile, "attributes", "avatar", "data", "attributes", "url"),
    role: at(profile, "attributes", "companyRole"),
  };
}

function profilesOf(teams: Team[]): CompanyProfile[] {
  const profiles = new Map<number, CompanyProfile>();
  for (const team of teams) {
    for (const person of team.profiles) {
      const name = normalisedName(`${person.firstName} ${person.lastName}`);
      if (name === "") continue;
      const profile = profiles.get(person.id) ?? newProfile(person, name);
      if (isKept(team)) profile.teams.push(team.slug);
      profiles.set(person.id, profile);
    }
  }
  return [...profiles.values()];
}

function newProfile(person: TeamProfile, name: string): CompanyProfile {
  const image = sizedCloudinaryImage(person.cutout);
  const role = nonBlank(person.role);
  return {
    profile: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    normalisedName: name,
    ...(image !== undefined && { image }),
    colour: colourOf(person.colour),
    teams: [],
    ...(role !== undefined && { role }),
  };
}

function keptTeamsOf(teams: Team[]): CompanyTeam[] {
  return teams.filter(isKept).map((team) => {
    const crestImage = sizedCloudinaryImage(team.crest);
    return {
      team: team.slug,
      name: team.name,
      ...(crestImage !== undefined && { crestImage }),
      leads: team.leads,
      people: team.profiles.map(({ id }) => id),
    };
  });
}

function isKept(team: Team): team is Team & { slug: string; name: string } {
  return team.slug !== undefined && team.name !== undefined;
}

function sizedCloudinaryImage(url: unknown) {
  const parts = typeof url === "string" ? cloudinaryImages.exec(url) : null;
  return parts === null ? undefined : `${parts[1]}${cutoutSize}${parts[2]}`;
}

function colourOf(name: unknown) {
  return typeof name === "string" && Object.hasOwn(profileColours, name) ? profileColours[name]! : neutralColour;
}

function at(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (typeof current === "object" && current !== null ? (current as Record<string, unknown>)[key] : undefined), value);
}
