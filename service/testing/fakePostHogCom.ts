// posthog.com's team pages API, as the root testing/fakePostHogCom.ts fakes it: the teams a test gives, paged, with only
// the fields and relations the request asks for, and any page's answer scripted.
import type { ScriptedAnswer } from "./fakeSlack.ts";

export type TeamPageProfile = {
  id: number;
  firstName: string;
  lastName: string;
  colour?: string | null;
  cutout?: string | null;
  role?: string | null;
};

export type TeamPage = { slug: string | null; name?: string | null; crest?: string | null; leads?: number[]; profiles: TeamPageProfile[] };

const host = "better-animal-d658c56969.strapiapp.com";

export const aCutout = (file: string) => `https://res.cloudinary.com/posthog-test/image/upload/v1/${file}.png`;

type Asked = { teamFields: string[]; profileFields: string[]; populates: (relation: string) => boolean };

export class FakePostHogCom {
  private teams: TeamPage[] = [];
  private pageSize = 100;
  private readonly scripted = new Map<number, ScriptedAnswer>();

  owns(url: URL) {
    return url.host === host;
  }

  withTeams(...teams: TeamPage[]) {
    this.teams = teams;
    return this;
  }

  pagedBy(pageSize: number) {
    this.pageSize = pageSize;
    return this;
  }

  answersPage(page: number, answer: ScriptedAnswer) {
    this.scripted.set(page, answer);
    return this;
  }

  readonly fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname !== "/api/teams") return new Response("not found", { status: 404 });
    const page = Number(url.searchParams.get("pagination[page]") ?? "1");
    const asPostHogComWould = () => Response.json(this.page(page, askedIn(url)));
    const scripted = this.scripted.get(page);
    return scripted === undefined ? asPostHogComWould() : scripted(asPostHogComWould);
  };

  private page(page: number, asked: Asked) {
    const pageCount = Math.max(1, Math.ceil(this.teams.length / this.pageSize));
    const teams = this.teams.slice((page - 1) * this.pageSize, page * this.pageSize);
    return {
      data: teams.map((team, index) => ({ id: index + 1, attributes: asStrapiTeam(team, asked) })),
      meta: { pagination: { page, pageSize: this.pageSize, pageCount, total: this.teams.length } },
    };
  }
}

function askedIn(url: URL): Asked {
  const keys = [...url.searchParams.keys()];
  const valuesOf = (field: RegExp) => keys.filter((key) => field.test(key)).map((key) => url.searchParams.get(key)!);
  return {
    teamFields: valuesOf(/^fields\[\d+\]$/),
    profileFields: valuesOf(/^populate\[profiles\]\[fields\]\[\d+\]$/),
    populates: (relation) => keys.some((key) => key.startsWith(`populate${relation}`)),
  };
}

function asStrapiTeam({ slug, name, crest, leads, profiles }: TeamPage, asked: Asked) {
  return {
    ...(asked.teamFields.includes("slug") && { slug }),
    ...(asked.teamFields.includes("name") && { name: name ?? null }),
    ...(asked.populates("[crest]") && { crest: { data: crest ? { id: 1, attributes: { url: crest } } : null } }),
    ...(asked.populates("[leadProfiles]") && { leadProfiles: { data: (leads ?? []).map((id) => ({ id, attributes: {} })) } }),
    ...(asked.populates("[profiles]") && { profiles: { data: profiles.map((profile) => asStrapiProfile(profile, asked)) } }),
  };
}

function asStrapiProfile({ id, firstName, lastName, colour, cutout, role }: TeamPageProfile, asked: Asked) {
  const fields = { firstName, lastName, color: colour ?? null, companyRole: role ?? null };
  return {
    id,
    attributes: {
      ...Object.fromEntries(Object.entries(fields).filter(([field]) => asked.profileFields.includes(field))),
      ...(asked.populates("[profiles][populate][avatar]") && { avatar: { data: cutout ? { id, attributes: { url: cutout } } : null } }),
    },
  };
}
