// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";

export const hugWeeks = pgTable(
  "hugWeeks",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    given: f64().notNull(),
    givenXp: f64().notNull(),
    received: f64().notNull(),
    receivedXp: f64().notNull(),
    mostHugged: value(),
  },
  (t) => [
    index("hugWeeks_by_member_week").on(t.member, t.week, t._creationTime, t._id),
    index("hugWeeks_by_week").on(t.week, t._creationTime, t._id),
  ],
);

export const hugWeekMessages = pgTable(
  "hugWeekMessages",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    hugs: f64().notNull(),
    lastAt: f64().notNull(),
  },
  (t) => [
    index("hugWeekMessages_by_member_week_message").on(t.member, t.week, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export const hugCounts = pgTable(
  "hugCounts",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    hugs: f64().notNull(),
  },
  (t) => [
    index("hugCounts_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export const hugs = pgTable(
  "hugs",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    giver: str().$type<Id<"members">>().notNull(),
    onKudos: bool().notNull(),
    author: str().$type<Id<"members">>(),
    emoji: str().notNull(),
    at: f64().notNull(),
    day: str().notNull(),
  },
  (t) => [
    index("hugs_by_message_giver").on(t.workspace, t.conversation, t.message, t.giver, t._creationTime, t._id),
    index("hugs_by_giver_day").on(t.giver, t.day, t._creationTime, t._id),
    index("hugs_by_giver_decided").on(t.giver, t._creationTime, t._id),
  ],
);

export const hugPeople = pgTable(
  "hugPeople",
  {
    _id: id(),
    _creationTime: creationTime(),
    hug: str().$type<Id<"hugs">>().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("hugPeople_by_hug_member").on(t.hug, t.member, t._creationTime, t._id),
    index("hugPeople_by_member_at").on(t.member, t.at, t._creationTime, t._id),
  ],
);

export const hugsReceived = pgTable(
  "hugsReceived",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    onKudos: bool().notNull(),
    hugs: f64().notNull(),
    emoji: str().notNull(),
    at: f64().notNull(),
    givers: value().notNull(),
    supersededAt: f64(),
  },
  (t) => [
    index("hugsReceived_by_member").on(t.member, t._creationTime, t._id),
    index("hugsReceived_by_member_message").on(t.member, t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export interface HugsDocuments {
  hugWeeks: { _id: Id<"hugWeeks">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "week": string; "given": number; "givenXp": number; "received": number; "receivedXp": number; "mostHugged"?: { "conversation": string; "message": string; "hugs": number; "lastAt": number } });
  hugWeekMessages: { _id: Id<"hugWeekMessages">; _creationTime: number } & ({ "member": Id<"members">; "week": string; "conversation": string; "message": string; "hugs": number; "lastAt": number });
  hugCounts: { _id: Id<"hugCounts">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "hugs": number });
  hugs: { _id: Id<"hugs">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "giver": Id<"members">; "onKudos": boolean; "author"?: Id<"members">; "emoji": string; "at": number; "day": string });
  hugPeople: { _id: Id<"hugPeople">; _creationTime: number } & ({ "hug": Id<"hugs">; "member": Id<"members">; "at": number });
  hugsReceived: { _id: Id<"hugsReceived">; _creationTime: number } & ({ "member": Id<"members">; "workspace": string; "conversation": string; "message": string; "onKudos": boolean; "hugs": number; "emoji": string; "at": number; "givers": Array<{ "giver": Id<"members">; "at": number }>; "supersededAt"?: number });
}
