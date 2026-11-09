// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { sql } from "drizzle-orm";
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";
import { nullValued } from "../documents.ts";

export const welcomeNudges = pgTable(
  "welcomeNudges",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("welcomeNudges_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const indicators = pgTable(
  "indicators",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    emoji: str(),
    version: f64().notNull(),
  },
  (t) => [
    index("indicators_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);
nullValued(indicators, ["emoji"]);

export const privateReplies = pgTable(
  "privateReplies",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    threadRoot: str(),
    to: str().notNull(),
    given: value(),
    lines: value().notNull(),
    questsDone: value(),
    hint: value(),
    gains: value(),
    held: bool().$type<true>(),
  },
  (t) => [
    index("privateReplies_by_held_message").on(t.workspace, t.conversation, t.message, t.held.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const oneReplies = pgTable(
  "oneReplies",
  {
    _id: id(),
    _creationTime: creationTime(),
    reply: str().$type<Id<"privateReplies">>().notNull(),
    left: str().notNull(),
    awaitsQuests: bool().$type<true>(),
    awaitsItems: bool().$type<true>(),
    items: value(),
    questsMoved: value(),
  },
  (t) => [
    index("oneReplies_by_reply").on(t.reply, t._creationTime, t._id),
  ],
);

export const grantReplies = pgTable(
  "grantReplies",
  {
    _id: id(),
    _creationTime: creationTime(),
    message: value().notNull(),
    told: str().$type<"one-reply" | "album-reply">().notNull(),
    message$workspace: str("message.workspace").generatedAlwaysAs(sql`CASE jsonb_typeof("message"->'workspace') WHEN 'string' THEN "message"->>'workspace' END`),
    message$conversation: str("message.conversation").generatedAlwaysAs(sql`CASE jsonb_typeof("message"->'conversation') WHEN 'string' THEN "message"->>'conversation' END`),
    message$message: str("message.message").generatedAlwaysAs(sql`CASE jsonb_typeof("message"->'message') WHEN 'string' THEN "message"->>'message' END`),
  },
  (t) => [
    index("grantReplies_by_message").on(t.message$workspace.asc().nullsFirst(), t.message$conversation.asc().nullsFirst(), t.message$message.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const sentNotices = pgTable(
  "sentNotices",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    notice: str().$type<"first-hug-reply" | "coins-opened">().notNull(),
  },
  (t) => [
    index("sentNotices_by_member_notice").on(t.member, t.notice, t._creationTime, t._id),
  ],
);

export const celebratedLevels = pgTable(
  "celebratedLevels",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    level: f64().notNull(),
  },
  (t) => [
    index("celebratedLevels_by_member_message").on(t.member, t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export const publicReplies = pgTable(
  "publicReplies",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    channel: str().notNull(),
    sections: value().notNull(),
    version: f64().notNull(),
    shown: value().notNull(),
    conversation: str(),
    message: str(),
    threadTs: str(),
    reached: value(),
    summary: str().$type<Id<"tierSummaries">>(),
    reached$member: str("reached.member").generatedAlwaysAs(sql`CASE jsonb_typeof("reached"->'member') WHEN 'string' THEN "reached"->>'member' END`),
    reached$level: f64("reached.level").generatedAlwaysAs(sql`CASE jsonb_typeof("reached"->'level') WHEN 'number' THEN ("reached"->>'level')::double precision WHEN 'object' THEN ("reached"->'level'->>'$float')::double precision END`),
  },
  (t) => [
    index("publicReplies_by_destination").on(t.workspace, t.conversation.asc().nullsFirst(), t.message.asc().nullsFirst(), t.channel, t.threadTs.asc().nullsFirst(), t._creationTime, t._id),
    index("publicReplies_by_level_reached").on(t.reached$member.asc().nullsFirst(), t.reached$level.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const tierNotices = pgTable(
  "tierNotices",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    tiers: value().notNull(),
  },
  (t) => [
    index("tierNotices_by_member_message").on(t.member, t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export const tierSummaries = pgTable(
  "tierSummaries",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    workspace: str().notNull(),
    tiers: value().notNull(),
    batch: str().$type<Id<"bookBatches">>(),
  },
  (t) => [
    index("tierSummaries_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const homes = pgTable(
  "homes",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    tab: str().$type<"profile" | "settings" | "admin">().notNull(),
    version: f64().notNull(),
  },
  (t) => [
    index("homes_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const homeSelections = pgTable(
  "homeSelections",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    tab: str().$type<"profile" | "leaderboard" | "book" | "skillTree" | "inventory" | "settings" | "admin">().notNull(),
    period: str().$type<"week" | "month" | "all">().notNull(),
  },
  (t) => [
    index("homeSelections_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const thankYouNudges = pgTable(
  "thankYouNudges",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
  },
  (t) => [
    index("thankYouNudges_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export interface FeedbackDocuments {
  welcomeNudges: { _id: Id<"welcomeNudges">; _creationTime: number } & ({ "member": Id<"members">; "at": number });
  indicators: { _id: Id<"indicators">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "emoji": string | null; "version": number });
  privateReplies: { _id: Id<"privateReplies">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "threadRoot"?: string; "to": string; "given"?: Array<{ "text": string } | { "mention": { "kind": "person"; "user": string } | { "kind": "group"; "group": string } | { "kind": "broadcast"; "range": string } } | { "link": { "url": string; "label": string } }>; "lines": Array<Array<{ "text": string } | { "mention": { "kind": "person"; "user": string } | { "kind": "group"; "group": string } | { "kind": "broadcast"; "range": string } } | { "link": { "url": string; "label": string } }>>; "questsDone"?: Array<{ "text": string } | { "mention": { "kind": "person"; "user": string } | { "kind": "group"; "group": string } | { "kind": "broadcast"; "range": string } } | { "link": { "url": string; "label": string } }>; "hint"?: Array<{ "text": string } | { "mention": { "kind": "person"; "user": string } | { "kind": "group"; "group": string } | { "kind": "broadcast"; "range": string } } | { "link": { "url": string; "label": string } }>; "gains"?: { "xp": number; "coins"?: number; "questsDone"?: Array<{ "kind": "journey"; "step": "first-thanks" | "first-quest" | "someone-new" | "two-days" | "your-emoji" | "hugs-3" | "hugs-5" | "hugs-10"; "xp": number; "coins"?: number; "heldRewardKey"?: string; "hoggie"?: true } | { "kind": "weekly"; "goal": string; "xp": number; "coins"?: number; "heldRewardKey"?: string; "hoggie"?: true }>; "bonus"?: Array<{ "source": "spark" | "rhythm" | "circle" | "flame" | "cadence" | "bridge" | "treasurer" | "banker"; "xp": number }> }; "held"?: true });
  oneReplies: { _id: Id<"oneReplies">; _creationTime: number } & ({ "reply": Id<"privateReplies">; "left": string; "awaitsQuests"?: true; "awaitsItems"?: true; "items"?: { "outcomes": Array<{ "recipient": Id<"members">; "outcome": "new" | "held" | "waiting" | "nextWeek" }>; "more": number }; "questsMoved"?: Array<{ "goal": string; "progress": { "done": number; "of": number; "unit": "kudos" | "days" | "people" } }> });
  grantReplies: { _id: Id<"grantReplies">; _creationTime: number } & ({ "message": { "workspace": string; "conversation": string; "message": string }; "told": "one-reply" | "album-reply" });
  sentNotices: { _id: Id<"sentNotices">; _creationTime: number } & ({ "member": Id<"members">; "notice": "first-hug-reply" | "coins-opened" });
  celebratedLevels: { _id: Id<"celebratedLevels">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "member": Id<"members">; "level": number });
  publicReplies: { _id: Id<"publicReplies">; _creationTime: number } & ({ "workspace": string; "channel": string; "sections": Array<{ "key": string; "member": Id<"members">; "about": "level" | "achievement"; "line": Array<{ "text": string } | { "mention": { "kind": "person"; "user": string } | { "kind": "group"; "group": string } | { "kind": "broadcast"; "range": string } } | { "link": { "url": string; "label": string } }> }>; "version": number; "shown": { "state": "unposted" } | { "state": "posting" } | { "state": "sending" } | { "state": "posted"; "ts": string }; "conversation": string; "message": string; "threadTs"?: string } | { "workspace": string; "channel": string; "sections": Array<{ "key": string; "member": Id<"members">; "about": "level" | "achievement"; "line": Array<{ "text": string } | { "mention": { "kind": "person"; "user": string } | { "kind": "group"; "group": string } | { "kind": "broadcast"; "range": string } } | { "link": { "url": string; "label": string } }> }>; "version": number; "shown": { "state": "unposted" } | { "state": "posting" } | { "state": "sending" } | { "state": "posted"; "ts": string }; "reached": { "member": Id<"members">; "level": number } } | { "workspace": string; "channel": string; "sections": Array<{ "key": string; "member": Id<"members">; "about": "level" | "achievement"; "line": Array<{ "text": string } | { "mention": { "kind": "person"; "user": string } | { "kind": "group"; "group": string } | { "kind": "broadcast"; "range": string } } | { "link": { "url": string; "label": string } }> }>; "version": number; "shown": { "state": "unposted" } | { "state": "posting" } | { "state": "sending" } | { "state": "posted"; "ts": string }; "summary": Id<"tierSummaries"> });
  tierNotices: { _id: Id<"tierNotices">; _creationTime: number } & ({ "member": Id<"members">; "workspace": string; "conversation": string; "message": string; "tiers": Array<{ "ladder": "generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends" | "team-spirit"; "tier": "bronze" | "silver" | "gold" | "diamond" }> });
  tierSummaries: { _id: Id<"tierSummaries">; _creationTime: number } & ({ "member": Id<"members">; "workspace": string; "tiers": Array<{ "ladder": "generosity" | "recognition" | "connections" | "dependability" | "applause" | "seasons" | "old-friends" | "team-spirit"; "tier": "bronze" | "silver" | "gold" | "diamond" }>; "batch"?: Id<"bookBatches"> });
  homes: { _id: Id<"homes">; _creationTime: number } & ({ "member": Id<"members">; "tab": "profile" | "settings" | "admin"; "version": number });
  homeSelections: { _id: Id<"homeSelections">; _creationTime: number } & ({ "member": Id<"members">; "tab": "profile" | "leaderboard" | "book" | "skillTree" | "inventory" | "settings" | "admin"; "period": "week" | "month" | "all" });
  thankYouNudges: { _id: Id<"thankYouNudges">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string });
}
