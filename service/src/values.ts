// The schemas a converted validator needs beyond zod's own, where zod and Convex would judge a value apart:
// - a number is any float64, NaN and ±Infinity included, as Convex's `v.number()` takes them (zod refuses both);
// - an ID is any string: a loaded row keeps its Convex ID and a new row gets a UUID, so no table is encoded in it;
// - a record's keys are what Convex takes as a field name: printable ASCII, 1 to 1024 characters, not starting with `$`
//   or `_`.
// The rest of a validator maps to zod one to one (tools/rewrite/moduleMap/codemod.ts).
import { z } from "zod";
import type { Id } from "./db/columns.ts";

/** Whether Convex takes a string as a record's key. */
export function isRecordKey(key: string): boolean {
  return key.length > 0 && key.length <= 1024 && !/^[$_]/.test(key) && /^[\x20-\x7e]*$/.test(key);
}

export const zv = {
  number: () => z.custom<number>((value) => typeof value === "number", { message: "Expected a number" }),
  id: <Table extends string>(table: Table) => z.custom<Id<Table>>((value) => typeof value === "string", { message: `Expected an ID of ${table}` }),
  // The keys are checked as given: zod's record drops a `__proto__` key before any check of its own output could see it.
  record: <Value extends z.ZodType>(key: z.ZodString, value: Value) =>
    z
      .custom<unknown>((raw) => typeof raw !== "object" || raw === null || Object.keys(raw).every(isRecordKey), { message: "Expected keys Convex takes as field names" })
      .pipe(z.record(key, value)),
};
