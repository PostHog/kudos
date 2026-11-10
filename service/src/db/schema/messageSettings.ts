// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";

export const progressSettings = documentTable(
  "progressSettings",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    dms: bool(),
    muteNotices: bool(),
  },
  (t) => [
    index("progressSettings_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const messageSettings = documentTable(
  "messageSettings",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    kind: str().$type<"kudos-reply" | "tips" | "level-ups" | "new-features" | "quests" | "achievements" | "celebrations" | "hugs-recap">().notNull(),
    on: bool().notNull(),
    place: str().$type<"channel" | "dm" | "none">(),
  },
  (t) => [
    index("messageSettings_by_member_kind").on(t.member, t.kind, t._creationTime, t._id),
  ],
);

export interface MessageSettingsDocuments {
  progressSettings: { _id: Id<"progressSettings">; _creationTime: number } & ({ "member": Id<"members">; "dms"?: boolean; "muteNotices"?: boolean });
  messageSettings: { _id: Id<"messageSettings">; _creationTime: number } & ({ "member": Id<"members">; "kind": "kudos-reply" | "tips" | "level-ups" | "new-features" | "quests" | "achievements" | "celebrations" | "hugs-recap"; "on": boolean; "place"?: "channel" | "dm" | "none" });
}
