// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";
import { nullValued } from "../documents.ts";

export const companyProfiles = documentTable(
  "companyProfiles",
  {
    _id: id(),
    _creationTime: creationTime(),
    firstName: str().notNull(),
    lastName: str().notNull(),
    normalisedName: str().notNull(),
    image: str(),
    colour: str().notNull(),
    team: str(),
    profile: f64(),
    teams: value(),
    role: str(),
    asOf: f64(),
  },
  (t) => [
    index("companyProfiles_by_normalised_name").on(t.normalisedName, t._creationTime, t._id),
  ],
);

export const companyTeams = documentTable(
  "companyTeams",
  {
    _id: id(),
    _creationTime: creationTime(),
    team: str().notNull(),
    name: str().notNull(),
    crestImage: str(),
    leads: value().notNull(),
    people: value().notNull(),
    asOf: f64().notNull(),
  },
  (t) => [
    index("companyTeams_by_team").on(t.team, t._creationTime, t._id),
  ],
);

export const companyFaces = documentTable(
  "companyFaces",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    face: value().notNull(),
    profile: f64(),
  },
  (t) => [
    index("companyFaces_by_member").on(t.workspace, t.member, t._creationTime, t._id),
  ],
);

export const companyProfileLinks = documentTable(
  "companyProfileLinks",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    profile: f64(),
    by: str().$type<"self" | "admin">().notNull(),
    setBy: str().$type<Id<"members">>().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("companyProfileLinks_by_member").on(t.workspace, t.member, t.by, t._creationTime, t._id),
    index("companyProfileLinks_by_profile").on(t.workspace, t.profile.asc().nullsFirst(), t._creationTime, t._id),
  ],
);
nullValued(companyProfileLinks, ["profile"]);

export interface CompanyProfilesDocuments {
  companyProfiles: { _id: Id<"companyProfiles">; _creationTime: number } & ({ "firstName": string; "lastName": string; "normalisedName": string; "image"?: string; "colour": string; "team"?: string; "profile"?: number; "teams"?: Array<string>; "role"?: string; "asOf"?: number });
  companyTeams: { _id: Id<"companyTeams">; _creationTime: number } & ({ "team": string; "name": string; "crestImage"?: string; "leads": Array<number>; "people": Array<number>; "asOf": number });
  companyFaces: { _id: Id<"companyFaces">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "face": { "image": string; "colour": string } | null; "profile"?: number });
  companyProfileLinks: { _id: Id<"companyProfileLinks">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "profile": number | null; "by": "self" | "admin"; "setBy": Id<"members">; "at": number });
}
