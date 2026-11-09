// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { sql } from "drizzle-orm";
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";
import { nullValued } from "../documents.ts";

export const effectsRecords = pgTable(
  "effectsRecords",
  {
    _id: id(),
    _creationTime: creationTime(),
    award: str().$type<Id<"awards">>().notNull(),
    side: str().$type<"giver" | "recipient">().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    day: str().notNull(),
    baseXp: f64().notNull(),
    gate: value().notNull(),
    catalogueVersion: str().notNull(),
    bonus: value(),
    coins: value(),
  },
  (t) => [
    index("effectsRecords_by_award").on(t.award, t.side, t._creationTime, t._id),
    index("effectsRecords_by_member_side").on(t.member, t.side, t._creationTime, t._id),
  ],
);

export const rewardRecords = pgTable(
  "rewardRecords",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    key: str().notNull(),
    xp: f64().notNull(),
    coins: f64().notNull(),
    item: str(),
    catalogueVersion: str().notNull(),
    at: f64().notNull(),
    cause: value(),
    held: bool().$type<true>(),
    cause$workspace: str("cause.workspace").generatedAlwaysAs(sql`CASE jsonb_typeof("cause"->'workspace') WHEN 'string' THEN "cause"->>'workspace' END`),
    cause$conversation: str("cause.conversation").generatedAlwaysAs(sql`CASE jsonb_typeof("cause"->'conversation') WHEN 'string' THEN "cause"->>'conversation' END`),
    cause$message: str("cause.message").generatedAlwaysAs(sql`CASE jsonb_typeof("cause"->'message') WHEN 'string' THEN "cause"->>'message' END`),
  },
  (t) => [
    index("rewardRecords_by_member_key").on(t.member, t.key, t._creationTime, t._id),
    index("rewardRecords_by_member_cause").on(t.member, t.cause$workspace.asc().nullsFirst(), t.cause$conversation.asc().nullsFirst(), t.cause$message.asc().nullsFirst(), t._creationTime, t._id),
  ],
);
nullValued(rewardRecords, ["item"]);

export const receivingGivers = pgTable(
  "receivingGivers",
  {
    _id: id(),
    _creationTime: creationTime(),
    recipient: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    giver: str().$type<Id<"members">>().notNull(),
  },
  (t) => [
    index("receivingGivers_by_recipient_week").on(t.recipient, t.week, t._creationTime, t._id),
  ],
);

export const effectsBackfill = pgTable(
  "effectsBackfill",
  {
    _id: id(),
    _creationTime: creationTime(),
    before: f64().notNull(),
    cursor: str(),
    isDone: bool().notNull(),
  },
  (t) => [

  ],
);
nullValued(effectsBackfill, ["cursor"]);

export const memberProgress = pgTable(
  "memberProgress",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    xp: f64().notNull(),
    pointsSpent: f64().notNull(),
  },
  (t) => [
    index("memberProgress_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const perksOwned = pgTable(
  "perksOwned",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    perk: str().$type<"spark" | "rhythm" | "circle" | "flame" | "cadence" | "bridge" | "treasurer" | "banker">().notNull(),
    boughtAt: f64().notNull(),
    catalogueVersion: str().notNull(),
  },
  (t) => [
    index("perksOwned_by_member_perk").on(t.member, t.perk, t._creationTime, t._id),
  ],
);

export const perkPurchases = pgTable(
  "perkPurchases",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    key: str().notNull(),
    outcome: value().notNull(),
  },
  (t) => [
    index("perkPurchases_by_member_key").on(t.member, t.key, t._creationTime, t._id),
  ],
);

export interface ProgressionDocuments {
  effectsRecords: { _id: Id<"effectsRecords">; _creationTime: number } & ({ "award": Id<"awards">; "side": "giver" | "recipient"; "member": Id<"members">; "day": string; "baseXp": number; "gate": { "version": number; "thoughtful": boolean } | null; "catalogueVersion": string; "bonus"?: Array<{ "source": "spark" | "rhythm" | "circle" | "flame" | "cadence" | "bridge" | "treasurer" | "banker"; "xp": number }>; "coins"?: Array<{ "source": "giving" | "receiving" | ("spark" | "rhythm" | "circle" | "flame" | "cadence" | "bridge" | "treasurer" | "banker"); "coins": number }> });
  rewardRecords: { _id: Id<"rewardRecords">; _creationTime: number } & ({ "member": Id<"members">; "key": string; "xp": number; "coins": number; "item": string | null; "catalogueVersion": string; "at": number; "cause"?: { "workspace": string; "conversation": string; "message": string }; "held"?: true });
  receivingGivers: { _id: Id<"receivingGivers">; _creationTime: number } & ({ "recipient": Id<"members">; "week": string; "giver": Id<"members"> });
  effectsBackfill: { _id: Id<"effectsBackfill">; _creationTime: number } & ({ "before": number; "cursor": string | null; "isDone": boolean });
  memberProgress: { _id: Id<"memberProgress">; _creationTime: number } & ({ "member": Id<"members">; "xp": number; "pointsSpent": number });
  perksOwned: { _id: Id<"perksOwned">; _creationTime: number } & ({ "member": Id<"members">; "perk": "spark" | "rhythm" | "circle" | "flame" | "cadence" | "bridge" | "treasurer" | "banker"; "boughtAt": number; "catalogueVersion": string });
  perkPurchases: { _id: Id<"perkPurchases">; _creationTime: number } & ({ "member": Id<"members">; "key": string; "outcome": { "kind": "bought"; "perk": "spark" | "rhythm" | "circle" | "flame" | "cadence" | "bridge" | "treasurer" | "banker" } | { "kind": "refused"; "perk": "spark" | "rhythm" | "circle" | "flame" | "cadence" | "bridge" | "treasurer" | "banker"; "reason": "tree-locked" | "tree-ready" | "owned" | "retired" | "below-row" | "needs-prerequisite" | "no-skill-points" | "coins-not-open" | "no-coins" } });
}
