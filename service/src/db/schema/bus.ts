// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";

export const replays = documentTable(
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
