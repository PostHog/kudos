// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";

export const countedKudosGiven = documentTable(
  "countedKudosGiven",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
  },
  (t) => [
    index("countedKudosGiven_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export const countedRecognitions = documentTable(
  "countedRecognitions",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    key: str().notNull(),
  },
  (t) => [
    index("countedRecognitions_by_key").on(t.workspace, t.key, t._creationTime, t._id),
  ],
);

export const givenByDay = documentTable(
  "givenByDay",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    day: str().notNull(),
    kudos: f64().notNull(),
    kudosReceived: f64(),
    hugsGiven: f64(),
    hugsReceived: f64(),
  },
  (t) => [
    index("givenByDay_by_member_day").on(t.member, t.day, t._creationTime, t._id),
    index("givenByDay_by_workspace_day").on(t.workspace, t.day, t._creationTime, t._id),
  ],
);

export const attributedTotals = documentTable(
  "attributedTotals",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    group: str().$type<Id<"userGroups">>().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    period: str().notNull(),
    kudos: f64().notNull(),
    runningTotal: value(),
  },
  (t) => [
    index("attributedTotals_by_group_period").on(t.group, t.period, t._creationTime, t._id),
    index("attributedTotals_by_member_group_period").on(t.member, t.group, t.period, t._creationTime, t._id),
  ],
);

export const attributedGroupTotals = documentTable(
  "attributedGroupTotals",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    group: str().$type<Id<"userGroups">>().notNull(),
    period: str().notNull(),
    kudos: f64().notNull(),
    runningTotal: value(),
  },
  (t) => [
    index("attributedGroupTotals_by_group_period").on(t.group, t.period, t._creationTime, t._id),
  ],
);

export const countedAttributions = documentTable(
  "countedAttributions",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
  },
  (t) => [
    index("countedAttributions_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export const hugRunningTotals = documentTable(
  "hugRunningTotals",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    period: str().notNull(),
    runningTotal: value().notNull(),
  },
  (t) => [
    index("hugRunningTotals_by_period").on(t.workspace, t.period, t._creationTime, t._id),
    index("hugRunningTotals_by_member_period").on(t.member, t.period, t._creationTime, t._id),
  ],
);

export const givenTotals = documentTable(
  "givenTotals",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    period: str().notNull(),
    kudos: f64().notNull(),
    kudosReceived: f64(),
    hugsGiven: f64(),
    hugsReceived: f64(),
    firstDay: str(),
    runningTotal: value(),
  },
  (t) => [
    index("givenTotals_by_period").on(t.workspace, t.period, t._creationTime, t._id),
    index("givenTotals_by_member_period").on(t.member, t.period, t._creationTime, t._id),
  ],
);

export const mondayPostSettings = documentTable(
  "mondayPostSettings",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    on: bool().notNull(),
    timeZone: str().notNull(),
    generation: f64().notNull(),
    nextPostAt: f64(),
    channel: value(),
    channelCheck: value(),
  },
  (t) => [
    index("mondayPostSettings_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const mondayPostClaims = documentTable(
  "mondayPostClaims",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    week: str().notNull(),
    claimedAt: f64().notNull(),
    channel: str().notNull(),
    outcome: str().$type<"claimed" | "nobody-gave" | "posted" | "cant-post" | "failed">().notNull(),
  },
  (t) => [
    index("mondayPostClaims_by_workspace_week").on(t.workspace, t.week, t._creationTime, t._id),
  ],
);

export const featuredNewGivers = documentTable(
  "featuredNewGivers",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    place: f64().notNull(),
  },
  (t) => [
    index("featuredNewGivers_by_workspace_week").on(t.workspace, t.week, t._creationTime, t._id),
  ],
);

export const weekThankers = documentTable(
  "weekThankers",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    person: str().$type<Id<"members">>().notNull(),
  },
  (t) => [
    index("weekThankers_by_member_week_person").on(t.member, t.week, t.person, t._creationTime, t._id),
  ],
);

export const leaderboardSettings = documentTable(
  "leaderboardSettings",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    visible: bool().notNull(),
  },
  (t) => [
    index("leaderboardSettings_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export interface LeaderboardDocuments {
  countedKudosGiven: { _id: Id<"countedKudosGiven">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string });
  countedRecognitions: { _id: Id<"countedRecognitions">; _creationTime: number } & ({ "workspace": string; "key": string });
  givenByDay: { _id: Id<"givenByDay">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "day": string; "kudos": number; "kudosReceived"?: number; "hugsGiven"?: number; "hugsReceived"?: number });
  attributedTotals: { _id: Id<"attributedTotals">; _creationTime: number } & ({ "workspace": string; "group": Id<"userGroups">; "member": Id<"members">; "period": string; "kudos": number; "runningTotal"?: Array<number> });
  attributedGroupTotals: { _id: Id<"attributedGroupTotals">; _creationTime: number } & ({ "workspace": string; "group": Id<"userGroups">; "period": string; "kudos": number; "runningTotal"?: Array<number> });
  countedAttributions: { _id: Id<"countedAttributions">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string });
  hugRunningTotals: { _id: Id<"hugRunningTotals">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "period": string; "runningTotal": Array<number> });
  givenTotals: { _id: Id<"givenTotals">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "period": string; "kudos": number; "kudosReceived"?: number; "hugsGiven"?: number; "hugsReceived"?: number; "firstDay"?: string; "runningTotal"?: Array<number> });
  mondayPostSettings: { _id: Id<"mondayPostSettings">; _creationTime: number } & ({ "workspace": string; "on": boolean; "timeZone": string; "generation": number; "nextPostAt"?: number; "channel"?: { "id": string; "name": string }; "channelCheck"?: { "channel": string; "pick": number; "outcome": "checking" | "picked" | ("private" | "shared" | "customer" | "not-found" | "archived" | "failed") } });
  mondayPostClaims: { _id: Id<"mondayPostClaims">; _creationTime: number } & ({ "workspace": string; "week": string; "claimedAt": number; "channel": string; "outcome": "claimed" | "nobody-gave" | "posted" | "cant-post" | "failed" });
  featuredNewGivers: { _id: Id<"featuredNewGivers">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "week": string; "place": number });
  weekThankers: { _id: Id<"weekThankers">; _creationTime: number } & ({ "member": Id<"members">; "week": string; "person": Id<"members"> });
  leaderboardSettings: { _id: Id<"leaderboardSettings">; _creationTime: number } & ({ "member": Id<"members">; "visible": boolean });
}
