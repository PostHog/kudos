// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";

export const questStarts = documentTable(
  "questStarts",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("questStarts_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const questDraws = documentTable(
  "questDraws",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    drawnAt: f64().notNull(),
    slots: value().notNull(),
  },
  (t) => [
    index("questDraws_by_member_week").on(t.member, t.week, t._creationTime, t._id),
  ],
);

export const questProgress = documentTable(
  "questProgress",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    slot: f64().notNull(),
    quest: str().$type<"say-why" | "say-why-twice" | "say-why-three-times" | "say-why-two-days" | "say-why-three-days" | "someone-new" | "two-new" | "not-in-30-days" | "kudos-once" | "kudos-two-days" | "three-in-a-day" | "hug-once" | "hug-two-days" | "hug-ten">().notNull(),
    award: str().$type<Id<"awards">>().notNull(),
    recipient: str().$type<Id<"members">>().notNull(),
    day: str().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("questProgress_by_member_week_slot").on(t.member, t.week, t.slot, t._creationTime, t._id),
  ],
);

export const questsJudged = documentTable(
  "questsJudged",
  {
    _id: id(),
    _creationTime: creationTime(),
    award: str().$type<Id<"awards">>().notNull(),
  },
  (t) => [
    index("questsJudged_by_award").on(t.award, t._creationTime, t._id),
  ],
);

export const questFinishes = documentTable(
  "questFinishes",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    key: str().notNull(),
    xp: f64().notNull(),
    catalogueVersion: str().notNull(),
    at: f64().notNull(),
    cause: value(),
  },
  (t) => [
    index("questFinishes_by_member_key").on(t.member, t.key, t._creationTime, t._id),
  ],
);

export const questRecognitions = documentTable(
  "questRecognitions",
  {
    _id: id(),
    _creationTime: creationTime(),
    source: str().$type<"kudos" | "hug">().notNull(),
    workspace: str().notNull(),
    giver: str().$type<Id<"members">>().notNull(),
    people: value().notNull(),
    kudos: f64().notNull(),
    message: value().notNull(),
    day: str().notNull(),
    at: f64().notNull(),
    key: str().notNull(),
  },
  (t) => [
    index("questRecognitions_by_giver_key").on(t.giver, t.key, t._creationTime, t._id),
    index("questRecognitions_by_giver_day").on(t.giver, t.day, t._creationTime, t._id),
    index("questRecognitions_by_giver_source_at").on(t.giver, t.source, t.at, t._creationTime, t._id),
  ],
);

export const hugLadders = documentTable(
  "hugLadders",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("hugLadders_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const questSideDraws = documentTable(
  "questSideDraws",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    side: str().$type<"hug" | "kudos">().notNull(),
    quest: str().$type<"say-why" | "say-why-twice" | "say-why-three-times" | "say-why-two-days" | "say-why-three-days" | "someone-new" | "two-new" | "not-in-30-days" | "kudos-once" | "kudos-two-days" | "three-in-a-day" | "hug-once" | "hug-two-days" | "hug-ten">().notNull(),
    reward: value().notNull(),
    catalogueVersion: str().notNull(),
    feasibleBecause: value().notNull(),
    drawnAt: f64().notNull(),
  },
  (t) => [
    index("questSideDraws_by_member_week_side").on(t.member, t.week, t.side, t._creationTime, t._id),
  ],
);

export interface QuestsDocuments {
  questStarts: { _id: Id<"questStarts">; _creationTime: number } & ({ "member": Id<"members">; "at": number });
  questDraws: { _id: Id<"questDraws">; _creationTime: number } & ({ "member": Id<"members">; "week": string; "drawnAt": number; "slots": Array<{ "slot": number; "quest": "say-why" | "say-why-twice" | "say-why-three-times" | "say-why-two-days" | "say-why-three-days" | "someone-new" | "two-new" | "not-in-30-days" | "kudos-once" | "kudos-two-days" | "three-in-a-day" | "hug-once" | "hug-two-days" | "hug-ten"; "reward": { "xp": number; "coins": number; "item": null }; "catalogueVersion": string; "feasibleBecause": { "peopleLeft": number; "recognitionsLeft": number; "daysLeft"?: number } }> });
  questProgress: { _id: Id<"questProgress">; _creationTime: number } & ({ "member": Id<"members">; "week": string; "slot": number; "quest": "say-why" | "say-why-twice" | "say-why-three-times" | "say-why-two-days" | "say-why-three-days" | "someone-new" | "two-new" | "not-in-30-days" | "kudos-once" | "kudos-two-days" | "three-in-a-day" | "hug-once" | "hug-two-days" | "hug-ten"; "award": Id<"awards">; "recipient": Id<"members">; "day": string; "at": number });
  questsJudged: { _id: Id<"questsJudged">; _creationTime: number } & ({ "award": Id<"awards"> });
  questFinishes: { _id: Id<"questFinishes">; _creationTime: number } & ({ "member": Id<"members">; "key": string; "xp": number; "catalogueVersion": string; "at": number; "cause"?: { "workspace": string; "conversation": string; "message": string } });
  questRecognitions: { _id: Id<"questRecognitions">; _creationTime: number } & ({ "source": "kudos" | "hug"; "workspace": string; "giver": Id<"members">; "people": Array<Id<"members">>; "kudos": number; "message": { "workspace": string; "conversation": string; "message": string }; "day": string; "at": number; "key": string });
  hugLadders: { _id: Id<"hugLadders">; _creationTime: number } & ({ "member": Id<"members">; "at": number });
  questSideDraws: { _id: Id<"questSideDraws">; _creationTime: number } & ({ "member": Id<"members">; "week": string; "side": "hug" | "kudos"; "quest": "say-why" | "say-why-twice" | "say-why-three-times" | "say-why-two-days" | "say-why-three-days" | "someone-new" | "two-new" | "not-in-30-days" | "kudos-once" | "kudos-two-days" | "three-in-a-day" | "hug-once" | "hug-two-days" | "hug-ten"; "reward": { "xp": number; "coins": number; "item": null }; "catalogueVersion": string; "feasibleBecause": { "peopleLeft": number; "recognitionsLeft": number; "daysLeft"?: number } | { "hugsLeft": number; "daysLeft"?: number }; "drawnAt": number });
}
