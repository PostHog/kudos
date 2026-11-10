// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";

export const analyticsIds = documentTable(
  "analyticsIds",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    analyticsId: str().notNull(),
    profileFingerprint: value(),
    profileUncertain: bool(),
  },
  (t) => [
    index("analyticsIds_by_member").on(t.member, t._creationTime, t._id),
    index("analyticsIds_by_analytics_id").on(t.analyticsId, t._creationTime, t._id),
    index("analyticsIds_by_profile_fingerprint").on(t.profileFingerprint.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const workspaceKeys = documentTable(
  "workspaceKeys",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    workspaceKey: str().notNull(),
  },
  (t) => [
    index("workspaceKeys_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const analyticsOutbox = documentTable(
  "analyticsOutbox",
  {
    _id: id(),
    _creationTime: creationTime(),
    uuid: str().notNull(),
    event: str().notNull(),
    distinctId: str().notNull(),
    timestamp: f64().notNull(),
    properties: value().notNull(),
    exception: value(),
    person: value(),
    state: str().$type<"pending" | "sending" | "exhausted">().notNull(),
    failures: f64().notNull(),
    dueAt: f64().notNull(),
    lease: str(),
    reason: str().$type<"rejected" | "exhausted" | "expired">(),
  },
  (t) => [
    index("analyticsOutbox_by_state").on(t.state, t._creationTime, t._id),
    index("analyticsOutbox_by_due").on(t.state, t.dueAt, t._creationTime, t._id),
  ],
);

export const recordedFacts = documentTable(
  "recordedFacts",
  {
    _id: id(),
    _creationTime: creationTime(),
    fact: str().notNull(),
  },
  (t) => [
    index("recordedFacts_by_fact").on(t.fact, t._creationTime, t._id),
  ],
);

export const analyticsDrain = documentTable(
  "analyticsDrain",
  {
    _id: id(),
    _creationTime: creationTime(),
    job: str().$type<Id<"_scheduled_functions">>().notNull(),
    generation: str().notNull(),
  },
  (t) => [

  ],
);

export const errorSweep = documentTable(
  "errorSweep",
  {
    _id: id(),
    _creationTime: creationTime(),
    cursor: f64().notNull(),
    watchCursor: f64().notNull(),
  },
  (t) => [

  ],
);

export const watchedJobs = documentTable(
  "watchedJobs",
  {
    _id: id(),
    _creationTime: creationTime(),
    job: str().$type<Id<"_scheduled_functions">>().notNull(),
  },
  (t) => [
    index("watchedJobs_by_job").on(t.job, t._creationTime, t._id),
  ],
);

export const reportedJobs = documentTable(
  "reportedJobs",
  {
    _id: id(),
    _creationTime: creationTime(),
    job: str().$type<Id<"_scheduled_functions">>().notNull(),
  },
  (t) => [
    index("reportedJobs_by_job").on(t.job, t._creationTime, t._id),
  ],
);

export const flagExposures = documentTable(
  "flagExposures",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    flag: str().notNull(),
    value: value().notNull(),
  },
  (t) => [
    index("flagExposures_by_member_flag_value").on(t.member, t.flag, t.value, t._creationTime, t._id),
  ],
);

export interface AnalyticsDocuments {
  analyticsIds: { _id: Id<"analyticsIds">; _creationTime: number } & ({ "member": Id<"members">; "analyticsId": string; "profileFingerprint"?: string | null; "profileUncertain"?: boolean });
  workspaceKeys: { _id: Id<"workspaceKeys">; _creationTime: number } & ({ "workspace": string; "workspaceKey": string });
  analyticsOutbox: { _id: Id<"analyticsOutbox">; _creationTime: number } & ({ "uuid": string; "event": string; "distinctId": string; "timestamp": number; "properties": Record<string, string | number | boolean>; "exception"?: { "type": string; "value": string; "frames": Array<{ "filename": string; "function": string; "lineno": number }> }; "person"?: { "set": Record<string, string | boolean | Array<string>>; "unset": Array<string>; "fingerprint": string }; "state": "pending" | "sending" | "exhausted"; "failures": number; "dueAt": number; "lease"?: string; "reason"?: "rejected" | "exhausted" | "expired" });
  recordedFacts: { _id: Id<"recordedFacts">; _creationTime: number } & ({ "fact": string });
  analyticsDrain: { _id: Id<"analyticsDrain">; _creationTime: number } & ({ "job": Id<"_scheduled_functions">; "generation": string });
  errorSweep: { _id: Id<"errorSweep">; _creationTime: number } & ({ "cursor": number; "watchCursor": number });
  watchedJobs: { _id: Id<"watchedJobs">; _creationTime: number } & ({ "job": Id<"_scheduled_functions"> });
  reportedJobs: { _id: Id<"reportedJobs">; _creationTime: number } & ({ "job": Id<"_scheduled_functions"> });
  flagExposures: { _id: Id<"flagExposures">; _creationTime: number } & ({ "member": Id<"members">; "flag": string; "value": string | boolean });
}
