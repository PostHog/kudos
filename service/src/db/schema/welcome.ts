// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";

export const welcomes = pgTable(
  "welcomes",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    welcomed: value(),
    path: str().$type<"hug" | "thoughtful-given" | "thoughtful-received" | "catch-up">(),
  },
  (t) => [
    index("welcomes_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export interface WelcomeDocuments {
  welcomes: { _id: Id<"welcomes">; _creationTime: number } & ({ "member": Id<"members">; "welcomed"?: { "as": "recipient"; "giver": string } | { "as": "giver"; "recipients": Array<string> }; "path"?: "hug" | "thoughtful-given" | "thoughtful-received" | "catch-up" });
}
