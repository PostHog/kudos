// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { sql } from "drizzle-orm";
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";

export const users = pgTable(
  "users",
  {
    _id: id(),
    _creationTime: creationTime(),
    name: str(),
    givenName: str(),
    familyName: str(),
    image: str(),
    chatIdentity: value(),
    chatIdentity$workspace: str("chatIdentity.workspace").generatedAlwaysAs(sql`CASE jsonb_typeof("chatIdentity"->'workspace') WHEN 'string' THEN "chatIdentity"->>'workspace' END`),
    chatIdentity$user: str("chatIdentity.user").generatedAlwaysAs(sql`CASE jsonb_typeof("chatIdentity"->'user') WHEN 'string' THEN "chatIdentity"->>'user' END`),
  },
  (t) => [
    index("users_by_chat_identity").on(t.chatIdentity$workspace.asc().nullsFirst(), t.chatIdentity$user.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const websiteClock = pgTable(
  "websiteClock",
  {
    _id: id(),
    _creationTime: creationTime(),
    tick: f64().notNull(),
  },
  (t) => [

  ],
);

export const lastVisits = pgTable(
  "lastVisits",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("lastVisits_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const howItWorksCloses = pgTable(
  "howItWorksCloses",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    triedSlack: bool().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("howItWorksCloses_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export interface WebsiteDocuments {
  users: { _id: Id<"users">; _creationTime: number } & ({ "name"?: string; "givenName"?: string; "familyName"?: string; "image"?: string; "chatIdentity"?: { "workspace": string; "user": string } });
  websiteClock: { _id: Id<"websiteClock">; _creationTime: number } & ({ "tick": number });
  lastVisits: { _id: Id<"lastVisits">; _creationTime: number } & ({ "member": Id<"members">; "at": number });
  howItWorksCloses: { _id: Id<"howItWorksCloses">; _creationTime: number } & ({ "member": Id<"members">; "triedSlack": boolean; "at": number });
}
