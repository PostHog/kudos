// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";
import { nullValued } from "../documents.ts";

export const stickers = documentTable(
  "stickers",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    person: str().$type<Id<"members">>().notNull(),
    firstAward: str().$type<Id<"awards">>().notNull(),
    firstAt: f64().notNull(),
  },
  (t) => [
    index("stickers_by_member_person").on(t.member, t.person, t._creationTime, t._id),
    index("stickers_by_member_firstAt").on(t.member, t.firstAt, t._creationTime, t._id),
  ],
);

export const stickerBackfills = documentTable(
  "stickerBackfills",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    cursor: str(),
    isDone: bool().notNull(),
  },
  (t) => [
    index("stickerBackfills_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);
nullValued(stickerBackfills, ["cursor"]);

export const teamPageCompletions = documentTable(
  "teamPageCompletions",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    team: str().notNull(),
    name: str().notNull(),
    crestImage: str(),
    award: str().$type<Id<"awards">>().notNull(),
    at: f64().notNull(),
    people: f64().notNull(),
    told: bool().notNull(),
  },
  (t) => [
    index("teamPageCompletions_by_member_team").on(t.member, t.team, t._creationTime, t._id),
  ],
);

export const teamPageChecks = documentTable(
  "teamPageChecks",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    at: f64().notNull(),
    finished: bool().notNull(),
  },
  (t) => [
    index("teamPageChecks_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export interface StickersDocuments {
  stickers: { _id: Id<"stickers">; _creationTime: number } & ({ "member": Id<"members">; "person": Id<"members">; "firstAward": Id<"awards">; "firstAt": number });
  stickerBackfills: { _id: Id<"stickerBackfills">; _creationTime: number } & ({ "workspace": string; "cursor": string | null; "isDone": boolean });
  teamPageCompletions: { _id: Id<"teamPageCompletions">; _creationTime: number } & ({ "member": Id<"members">; "team": string; "name": string; "crestImage"?: string; "award": Id<"awards">; "at": number; "people": number; "told": boolean });
  teamPageChecks: { _id: Id<"teamPageChecks">; _creationTime: number } & ({ "member": Id<"members">; "at": number; "finished": boolean });
}
