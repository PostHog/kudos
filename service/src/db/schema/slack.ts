// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";

export const memberVerifications = pgTable(
  "memberVerifications",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    user: str().notNull(),
    attempts: f64().notNull(),
    state: str().$type<"pending" | "failed">().notNull(),
    nextTryAt: f64(),
  },
  (t) => [
    index("memberVerifications_by_user").on(t.workspace, t.user, t._creationTime, t._id),
    index("memberVerifications_by_state_and_next_try").on(t.state, t.nextTryAt.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const firstSignIns = pgTable(
  "firstSignIns",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    user: str().notNull(),
  },
  (t) => [
    index("firstSignIns_by_user").on(t.workspace, t.user, t._creationTime, t._id),
  ],
);

export const slackReceipts = pgTable(
  "slackReceipts",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    eventId: str().notNull(),
  },
  (t) => [
    index("slackReceipts_by_event").on(t.workspace, t.eventId, t._creationTime, t._id),
  ],
);

export const placedReactions = pgTable(
  "placedReactions",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    emoji: value().notNull(),
  },
  (t) => [
    index("placedReactions_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export const slackRateLimits = pgTable(
  "slackRateLimits",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    method: str().notNull(),
    until: f64().notNull(),
  },
  (t) => [
    index("slackRateLimits_by_method").on(t.workspace, t.method, t._creationTime, t._id),
  ],
);

export const cardPictures = pgTable(
  "cardPictures",
  {
    _id: id(),
    _creationTime: creationTime(),
    key: str().notNull(),
    picture: str().$type<Id<"_storage">>().notNull(),
  },
  (t) => [
    index("cardPictures_by_key").on(t.key, t._creationTime, t._id),
  ],
);

export interface SlackDocuments {
  memberVerifications: { _id: Id<"memberVerifications">; _creationTime: number } & ({ "workspace": string; "user": string; "attempts": number; "state": "pending" | "failed"; "nextTryAt"?: number });
  firstSignIns: { _id: Id<"firstSignIns">; _creationTime: number } & ({ "workspace": string; "user": string });
  slackReceipts: { _id: Id<"slackReceipts">; _creationTime: number } & ({ "workspace": string; "eventId": string });
  placedReactions: { _id: Id<"placedReactions">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "emoji": Array<string> });
  slackRateLimits: { _id: Id<"slackRateLimits">; _creationTime: number } & ({ "workspace": string; "method": string; "until": number });
  cardPictures: { _id: Id<"cardPictures">; _creationTime: number } & ({ "key": string; "picture": Id<"_storage"> });
}
