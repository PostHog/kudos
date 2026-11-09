// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";

export const bookLaunches = pgTable(
  "bookLaunches",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("bookLaunches_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const ladderCounts = pgTable(
  "ladderCounts",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    ladder: str().$type<"generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends" | "team-spirit">().notNull(),
    count: f64().notNull(),
  },
  (t) => [
    index("ladderCounts_by_member_ladder").on(t.member, t.ladder, t._creationTime, t._id),
  ],
);

export const ladderMarks = pgTable(
  "ladderMarks",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    ladder: str().$type<"generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends">().notNull(),
    group: str().notNull(),
    key: str().notNull(),
  },
  (t) => [
    index("ladderMarks_by_member_ladder_group").on(t.member, t.ladder, t.group, t._creationTime, t._id),
  ],
);

export const countedAwards = pgTable(
  "countedAwards",
  {
    _id: id(),
    _creationTime: creationTime(),
    award: str().$type<Id<"awards">>().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    ladder: str().$type<"generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends">().notNull(),
    count: f64().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("countedAwards_by_award_member_ladder").on(t.award, t.member, t.ladder, t._creationTime, t._id),
    index("countedAwards_by_member_ladder_count").on(t.member, t.ladder, t.count, t._creationTime, t._id),
  ],
);

export const bookBatches = pgTable(
  "bookBatches",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    at: f64().notNull(),
    completedAt: f64(),
  },
  (t) => [
    index("bookBatches_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const bookReplays = pgTable(
  "bookReplays",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    batch: str().$type<Id<"bookBatches">>().notNull(),
    ladder: str().$type<"generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends">().notNull(),
    tiers: value().notNull(),
    countsLadder: bool().notNull(),
    cursor: value(),
    isDone: bool().notNull(),
  },
  (t) => [
    index("bookReplays_by_workspace_ladder").on(t.workspace, t.ladder, t._creationTime, t._id),
    index("bookReplays_by_batch").on(t.batch, t._creationTime, t._id),
  ],
);

export const bookReplayCursors = pgTable(
  "bookReplayCursors",
  {
    _id: id(),
    _creationTime: creationTime(),
    replay: str().$type<Id<"bookReplays">>().notNull(),
    cursor: str().notNull(),
  },
  (t) => [
    index("bookReplayCursors_by_replay").on(t.replay, t._creationTime, t._id),
  ],
);

export const earnedTiers = pgTable(
  "earnedTiers",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    ladder: str().$type<"generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends" | "team-spirit">().notNull(),
    tier: str().$type<"bronze" | "silver" | "gold" | "diamond">().notNull(),
    earnedAt: f64().notNull(),
    award: str().$type<Id<"awards">>().notNull(),
    catalogueVersion: str().notNull(),
    rewards: value().notNull(),
    batch: str().$type<Id<"bookBatches">>(),
    hidden: bool().$type<true>(),
  },
  (t) => [
    index("earnedTiers_by_member_ladder_tier").on(t.member, t.ladder, t.tier, t._creationTime, t._id),
  ],
);

export interface AchievementsDocuments {
  bookLaunches: { _id: Id<"bookLaunches">; _creationTime: number } & ({ "workspace": string; "at": number });
  ladderCounts: { _id: Id<"ladderCounts">; _creationTime: number } & ({ "member": Id<"members">; "ladder": "generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends" | "team-spirit"; "count": number });
  ladderMarks: { _id: Id<"ladderMarks">; _creationTime: number } & ({ "member": Id<"members">; "ladder": "generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends"; "group": string; "key": string });
  countedAwards: { _id: Id<"countedAwards">; _creationTime: number } & ({ "award": Id<"awards">; "member": Id<"members">; "ladder": "generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends"; "count": number; "at": number });
  bookBatches: { _id: Id<"bookBatches">; _creationTime: number } & ({ "workspace": string; "at": number; "completedAt"?: number });
  bookReplays: { _id: Id<"bookReplays">; _creationTime: number } & ({ "workspace": string; "batch": Id<"bookBatches">; "ladder": "generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends"; "tiers": Array<"bronze" | "silver" | "gold" | "diamond">; "countsLadder": boolean; "cursor"?: string | null; "isDone": boolean });
  bookReplayCursors: { _id: Id<"bookReplayCursors">; _creationTime: number } & ({ "replay": Id<"bookReplays">; "cursor": string });
  earnedTiers: { _id: Id<"earnedTiers">; _creationTime: number } & ({ "member": Id<"members">; "ladder": "generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends" | "team-spirit"; "tier": "bronze" | "silver" | "gold" | "diamond"; "earnedAt": number; "award": Id<"awards">; "catalogueVersion": string; "rewards": Array<{ "kind": "coins" | "kudosEmoji" | "hedgehog"; "reward": string }>; "batch"?: Id<"bookBatches">; "hidden"?: true });
}
