// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";

export const unlocks = documentTable(
  "unlocks",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    feature: str().$type<"quests" | "leaderboard" | "book" | "skillTree" | "coins">().notNull(),
    readyAt: f64().notNull(),
    openedAt: f64(),
  },
  (t) => [
    index("unlocks_by_member_feature").on(t.member, t.feature, t._creationTime, t._id),
  ],
);

export const unlockLaunches = documentTable(
  "unlockLaunches",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    at: f64().notNull(),
    shipped: value().notNull(),
  },
  (t) => [
    index("unlockLaunches_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const previewMoments = documentTable(
  "previewMoments",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    moment: str().$type<"unlocks" | "journey">().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("previewMoments_by_member_moment").on(t.member, t.moment, t._creationTime, t._id),
  ],
);

export const levelUps = documentTable(
  "levelUps",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    level: f64().notNull(),
    ready: value().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("levelUps_by_member_level").on(t.member, t.level, t._creationTime, t._id),
    index("levelUps_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export interface UnlocksDocuments {
  unlocks: { _id: Id<"unlocks">; _creationTime: number } & ({ "member": Id<"members">; "feature": "quests" | "leaderboard" | "book" | "skillTree" | "coins"; "readyAt": number; "openedAt"?: number });
  unlockLaunches: { _id: Id<"unlockLaunches">; _creationTime: number } & ({ "workspace": string; "at": number; "shipped": Array<"quests" | "leaderboard" | "book" | "skillTree" | "coins"> });
  previewMoments: { _id: Id<"previewMoments">; _creationTime: number } & ({ "member": Id<"members">; "moment": "unlocks" | "journey"; "at": number });
  levelUps: { _id: Id<"levelUps">; _creationTime: number } & ({ "member": Id<"members">; "level": number; "ready": Array<"quests" | "leaderboard" | "book" | "skillTree" | "coins">; "at": number });
}
