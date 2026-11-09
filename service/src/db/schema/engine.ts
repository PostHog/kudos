// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";
import { nullValued } from "../documents.ts";

export const kudosMessages = pgTable(
  "kudosMessages",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    threadRoot: str(),
    author: str().notNull(),
    revision: i64().notNull(),
    state: str().$type<"watermark" | "awaiting-directory" | "abandoned" | "given" | "over-allowance" | "invalid" | "withdrawn">().notNull(),
    attempt: i64().notNull(),
    retry: bool(),
    content: value().notNull(),
    annotations: value().notNull(),
    spendsAt: f64().notNull(),
    checks: f64().notNull(),
    nextCheckAt: f64(),
  },
  (t) => [
    index("kudosMessages_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
    index("kudosMessages_by_state_and_next_check").on(t.state, t.nextCheckAt.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const kudosTexts = pgTable(
  "kudosTexts",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    kind: str().$type<"words" | "tombstone">().notNull(),
    revision: i64(),
    author: str(),
    edited: bool(),
    segments: value(),
    visibility: str().$type<("public" | "private") | "unknown">(),
    gate: value(),
    why: str().$type<"deleted" | "no-longer-kudos" | "removed">(),
  },
  (t) => [
    index("kudosTexts_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
    index("kudosTexts_by_author").on(t.workspace, t.author.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const wordDeletionRequests = pgTable(
  "wordDeletionRequests",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    author: str(),
  },
  (t) => [
    index("wordDeletionRequests_by_author").on(t.workspace, t.author.asc().nullsFirst(), t._creationTime, t._id),
  ],
);
nullValued(wordDeletionRequests, ["author"]);

export const spotlightDraws = pgTable(
  "spotlightDraws",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    position: f64().notNull(),
  },
  (t) => [
    index("spotlightDraws_by_position").on(t.workspace, t.position, t._creationTime, t._id),
    index("spotlightDraws_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
  ],
);

export const awards = pgTable(
  "awards",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    giver: str().$type<Id<"members">>().notNull(),
    recipient: str().$type<Id<"members">>().notNull(),
    kudos: f64().notNull(),
    day: str().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("awards_by_giver").on(t.giver, t.day, t._creationTime, t._id),
    index("awards_by_giver_recipient").on(t.giver, t.recipient, t._creationTime, t._id),
    index("awards_by_recipient").on(t.recipient, t.day, t._creationTime, t._id),
    index("awards_by_recipient_at").on(t.recipient, t.at, t._creationTime, t._id),
    index("awards_by_giver_at").on(t.giver, t.at, t._creationTime, t._id),
    index("awards_by_recipient_decided").on(t.recipient, t._creationTime, t._id),
    index("awards_by_giver_decided").on(t.giver, t._creationTime, t._id),
    index("awards_by_message").on(t.workspace, t.conversation, t.message, t._creationTime, t._id),
    index("awards_by_message_recipient").on(t.workspace, t.conversation, t.message, t.recipient, t._creationTime, t._id),
    index("awards_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);

export const kudosTotals = pgTable(
  "kudosTotals",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    given: f64().notNull(),
    received: f64().notNull(),
  },
  (t) => [
    index("kudosTotals_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const allowanceSpending = pgTable(
  "allowanceSpending",
  {
    _id: id(),
    _creationTime: creationTime(),
    giver: str().$type<Id<"members">>().notNull(),
    day: str().notNull(),
    spent: f64().notNull(),
  },
  (t) => [
    index("allowanceSpending_by_giver_day").on(t.giver, t.day, t._creationTime, t._id),
  ],
);

export interface EngineDocuments {
  kudosMessages: { _id: Id<"kudosMessages">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "threadRoot"?: string; "author": string; "revision": bigint; "state": "watermark" | "awaiting-directory" | "abandoned" | "given" | "over-allowance" | "invalid" | "withdrawn"; "attempt": bigint; "retry"?: boolean; "content": { "mentions": Array<{ "kind": "person"; "user": string } | { "kind": "group"; "group": string } | { "kind": "broadcast"; "range": string }>; "emoji": Array<string>; "mentionsBeforeEmoji"?: Array<number> }; "annotations": Record<string, (string | number | boolean) | Record<string, string | number | boolean>>; "spendsAt": number; "checks": number; "nextCheckAt"?: number });
  kudosTexts: { _id: Id<"kudosTexts">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "kind": "words"; "revision": bigint; "author": string; "edited": boolean; "segments": Array<{ "kind": "text"; "text": string; "bold"?: true; "italic"?: true; "strike"?: true; "code"?: true } | { "kind": "person"; "user": string } | { "kind": "group"; "group": string } | { "kind": "channel" } | { "kind": "broadcast"; "range": string } | { "kind": "emoji"; "name": string; "unicode"?: string } | { "kind": "link"; "url": string; "label"?: string } | { "kind": "break" }>; "visibility": ("public" | "private") | "unknown"; "gate": { "version": number; "thoughtful": boolean } | null } | { "workspace": string; "conversation": string; "message": string; "kind": "tombstone"; "why": "deleted" | "no-longer-kudos" | "removed" });
  wordDeletionRequests: { _id: Id<"wordDeletionRequests">; _creationTime: number } & ({ "workspace": string; "author": string | null });
  spotlightDraws: { _id: Id<"spotlightDraws">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "position": number });
  awards: { _id: Id<"awards">; _creationTime: number } & ({ "workspace": string; "conversation": string; "message": string; "giver": Id<"members">; "recipient": Id<"members">; "kudos": number; "day": string; "at": number });
  kudosTotals: { _id: Id<"kudosTotals">; _creationTime: number } & ({ "member": Id<"members">; "given": number; "received": number });
  allowanceSpending: { _id: Id<"allowanceSpending">; _creationTime: number } & ({ "giver": Id<"members">; "day": string; "spent": number });
}
