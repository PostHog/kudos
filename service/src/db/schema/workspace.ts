// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";

export const workspaces = documentTable(
  "workspaces",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    baseAllowance: f64(),
    kudosEmoji: str(),
    announcementChannel: str(),
    hugBudget: f64(),
    url: str(),
    urlRequestedAt: f64(),
  },
  (t) => [
    index("workspaces_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const members = documentTable(
  "members",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    user: str().notNull(),
    kind: str().$type<"member" | "bot" | "not-a-member">().notNull(),
    name: str(),
    timeZone: str(),
    admin: bool(),
    email: str(),
    realName: str(),
    displayName: str(),
    title: str(),
    picture: str(),
    asOf: f64(),
    profileAsOf: f64(),
  },
  (t) => [
    index("members_by_user").on(t.workspace, t.user, t._creationTime, t._id),
    index("members_by_admin").on(t.workspace, t.admin.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const listedMembers = documentTable(
  "listedMembers",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    user: str().notNull(),
    entry: value().notNull(),
    asOf: f64().notNull(),
  },
  (t) => [
    index("listedMembers_by_user").on(t.workspace, t.user, t._creationTime, t._id),
  ],
);

export const userGroups = documentTable(
  "userGroups",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    group: str().notNull(),
    handle: str().notNull(),
    name: str().notNull(),
    enabled: bool().notNull(),
    automatic: bool().notNull(),
    members: f64(),
    membersCountAsOf: f64(),
    asOf: f64().notNull(),
    membersAsOf: f64(),
    changedAt: f64(),
    allowlistChangedAt: f64(),
  },
  (t) => [
    index("userGroups_by_group").on(t.workspace, t.group, t._creationTime, t._id),
  ],
);

export const userGroupMembers = documentTable(
  "userGroupMembers",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    group: str().notNull(),
    user: str().notNull(),
  },
  (t) => [
    index("userGroupMembers_by_group").on(t.workspace, t.group, t.user, t._creationTime, t._id),
    index("userGroupMembers_by_user").on(t.workspace, t.user, t._creationTime, t._id),
  ],
);

export const customEmoji = documentTable(
  "customEmoji",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    name: str().notNull(),
    image: str().notNull(),
    aliasOf: str(),
    listing: f64().notNull(),
  },
  (t) => [
    index("customEmoji_by_name").on(t.workspace, t.name, t._creationTime, t._id),
    index("customEmoji_by_listing").on(t.workspace, t.listing, t._creationTime, t._id),
  ],
);

export const customEmojiListings = documentTable(
  "customEmojiListings",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    begun: f64().notNull(),
    written: f64(),
    refreshDueAt: f64(),
    scopeMissing: bool(),
  },
  (t) => [
    index("customEmojiListings_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const welcomeNudgeSwitches = documentTable(
  "welcomeNudgeSwitches",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    on: bool().notNull(),
  },
  (t) => [
    index("welcomeNudgeSwitches_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const celebrationsSwitches = documentTable(
  "celebrationsSwitches",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    on: bool().notNull(),
  },
  (t) => [
    index("celebrationsSwitches_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export interface WorkspaceDocuments {
  workspaces: { _id: Id<"workspaces">; _creationTime: number } & ({ "workspace": string; "baseAllowance"?: number; "kudosEmoji"?: string; "announcementChannel"?: string; "hugBudget"?: number; "url"?: string; "urlRequestedAt"?: number });
  members: { _id: Id<"members">; _creationTime: number } & ({ "workspace": string; "user": string; "kind": "member" | "bot" | "not-a-member"; "name"?: string; "timeZone"?: string; "admin"?: boolean; "email"?: string; "realName"?: string; "displayName"?: string; "title"?: string; "picture"?: string; "asOf"?: number; "profileAsOf"?: number });
  listedMembers: { _id: Id<"listedMembers">; _creationTime: number } & ({ "workspace": string; "user": string; "entry": { "kind": "member"; "name"?: string; "timeZone"?: string; "admin"?: boolean; "email"?: string; "realName"?: string; "displayName"?: string; "title"?: string; "picture"?: string } | { "kind": "bot" } | { "kind": "not-a-member" }; "asOf": number });
  userGroups: { _id: Id<"userGroups">; _creationTime: number } & ({ "workspace": string; "group": string; "handle": string; "name": string; "enabled": boolean; "automatic": boolean; "members"?: number; "membersCountAsOf"?: number; "asOf": number; "membersAsOf"?: number; "changedAt"?: number; "allowlistChangedAt"?: number });
  userGroupMembers: { _id: Id<"userGroupMembers">; _creationTime: number } & ({ "workspace": string; "group": string; "user": string });
  customEmoji: { _id: Id<"customEmoji">; _creationTime: number } & ({ "workspace": string; "name": string; "image": string; "aliasOf"?: string; "listing": number });
  customEmojiListings: { _id: Id<"customEmojiListings">; _creationTime: number } & ({ "workspace": string; "begun": number; "written"?: number; "refreshDueAt"?: number; "scopeMissing"?: boolean });
  welcomeNudgeSwitches: { _id: Id<"welcomeNudgeSwitches">; _creationTime: number } & ({ "workspace": string; "on": boolean });
  celebrationsSwitches: { _id: Id<"celebrationsSwitches">; _creationTime: number } & ({ "workspace": string; "on": boolean });
}
