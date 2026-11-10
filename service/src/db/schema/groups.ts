// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";
import { nullValued } from "../documents.ts";

export const userGroupDepartures = documentTable(
  "userGroupDepartures",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    user: str().notNull(),
    group: str().$type<Id<"userGroups">>().notNull(),
    joinedAt: f64().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("userGroupDepartures_by_user_at").on(t.workspace, t.user, t.at, t._creationTime, t._id),
  ],
);

export const groupCountingChanges = documentTable(
  "groupCountingChanges",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    group: str().$type<Id<"userGroups">>().notNull(),
    counts: bool().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("groupCountingChanges_by_group_at").on(t.group, t.at, t._creationTime, t._id),
  ],
);

export const memberGroups = documentTable(
  "memberGroups",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    groups: value().notNull(),
    primary: str().$type<Id<"userGroups">>(),
    directoryChangedAt: f64(),
  },
  (t) => [
    index("memberGroups_by_member").on(t.member, t._creationTime, t._id),
    index("memberGroups_by_primary").on(t.primary.asc().nullsFirst(), t._creationTime, t._id),
  ],
);
nullValued(memberGroups, ["primary"]);

export const groupSettings = documentTable(
  "groupSettings",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    mode: str().$type<"all" | "allowlist">().notNull(),
    allowlist: value(),
  },
  (t) => [
    index("groupSettings_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const primaryGroupHistory = documentTable(
  "primaryGroupHistory",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    from: str().$type<Id<"userGroups">>(),
    group: str().$type<Id<"userGroups">>(),
    cause: str().$type<"default" | "picked" | "fallback">().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("primaryGroupHistory_by_member_at").on(t.member, t.at, t._creationTime, t._id),
  ],
);
nullValued(primaryGroupHistory, ["from","group"]);

export const attributions = documentTable(
  "attributions",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    giver: str().$type<Id<"members">>().notNull(),
    group: str().$type<Id<"userGroups">>(),
    kudos: f64().notNull(),
    day: str().notNull(),
    at: f64().notNull(),
    awards: value().notNull(),
  },
  (t) => [
    index("attributions_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
    index("attributions_by_group_at").on(t.group.asc().nullsFirst(), t.at, t._creationTime, t._id),
  ],
);
nullValued(attributions, ["group"]);

export interface GroupsDocuments {
  userGroupDepartures: { _id: Id<"userGroupDepartures">; _creationTime: number } & ({ "workspace": string; "user": string; "group": Id<"userGroups">; "joinedAt": number; "at": number });
  groupCountingChanges: { _id: Id<"groupCountingChanges">; _creationTime: number } & ({ "workspace": string; "group": Id<"userGroups">; "counts": boolean; "at": number });
  memberGroups: { _id: Id<"memberGroups">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "groups": Array<Id<"userGroups">>; "primary": Id<"userGroups"> | null; "directoryChangedAt"?: number });
  groupSettings: { _id: Id<"groupSettings">; _creationTime: number } & ({ "workspace": string; "mode": "all" | "allowlist"; "allowlist"?: Array<Id<"userGroups">> });
  primaryGroupHistory: { _id: Id<"primaryGroupHistory">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "from": Id<"userGroups"> | null; "group": Id<"userGroups"> | null; "cause": "default" | "picked" | "fallback"; "at": number });
  attributions: { _id: Id<"attributions">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "giver": Id<"members">; "group": Id<"userGroups"> | null; "kudos": number; "day": string; "at": number; "awards": Array<{ "award": Id<"awards">; "recipient": Id<"members">; "kudos": number; "saysWhy": boolean; "recipientGroup": Id<"userGroups"> | null }> });
}
