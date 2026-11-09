// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";

export const mondayDms = pgTable(
  "mondayDms",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    monday: str().notNull(),
    state: str().$type<"scheduled" | "sent" | "skipped" | "failed">().notNull(),
    dueAt: f64().notNull(),
    tries: f64().notNull(),
    sections: value(),
    content: value(),
  },
  (t) => [
    index("mondayDms_by_member_monday").on(t.member, t.monday, t._creationTime, t._id),
    index("mondayDms_by_state_due").on(t.state, t.dueAt, t._creationTime, t._id),
  ],
);

export const mondayDmNudges = pgTable(
  "mondayDmNudges",
  {
    _id: id(),
    _creationTime: creationTime(),
    dm: str().$type<Id<"mondayDms">>().notNull(),
    line: str().notNull(),
  },
  (t) => [
    index("mondayDmNudges_by_dm").on(t.dm, t._creationTime, t._id),
  ],
);

export interface MondayDmDocuments {
  mondayDms: { _id: Id<"mondayDms">; _creationTime: number } & ({ "member": Id<"members">; "monday": string; "state": "scheduled" | "sent" | "skipped" | "failed"; "dueAt": number; "tries": number; "sections"?: Array<"hugs" | "quests" | "catch-up">; "content"?: { "hugs": { "lines": Array<string | { "text": string; "link": { "url": string; "label": string } }>; "closing": Array<string | { "text": string; "link": { "url": string; "label": string } }>; "emojiLine": { "text": string; "pictures": Array<{ "url": string; "name": string }> } | null } | null; "quests": { "heading": string; "checklist": Array<{ "goal": string; "mark": "done" | "next" | "open"; "progress": string | null; "howTo"?: string; "reward"?: string }>; "waiting": boolean; "links": { "book": string; "quests": string } | null } | null; "footer": { "appHome": string; "rest": string } | null } });
  mondayDmNudges: { _id: Id<"mondayDmNudges">; _creationTime: number } & ({ "dm": Id<"mondayDms">; "line": string });
}
