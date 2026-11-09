// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index, pgTable } from "drizzle-orm/pg-core";
import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";

export const replays = pgTable(
  "replays",
  {
    _id: id(),
    _creationTime: creationTime(),
    job: str().$type<Id<"_scheduled_functions">>().notNull(),
  },
  (t) => [
    index("replays_by_job").on(t.job, t._creationTime, t._id),
  ],
);

export interface BusDocuments {
  replays: { _id: Id<"replays">; _creationTime: number } & ({ "job": Id<"_scheduled_functions"> });
}
