// The schemas a converted validator needs beyond zod's own, where zod and Convex would judge a value apart:
// - a number is any float64, NaN and ±Infinity included, as Convex's `v.number()` takes them (zod refuses both);
// - an ID is any string: a loaded row keeps its Convex ID and a new row gets a UUID, so no table is encoded in it.
// The rest of a validator maps to zod one to one (tools/rewrite/moduleMap/codemod.ts).
import { z } from "zod";
import type { Id } from "./db/columns.ts";

export const zv = {
  number: () => z.custom<number>((value) => typeof value === "number", { message: "Expected a number" }),
  id: <Table extends string>(table: Table) => z.custom<Id<Table>>((value) => typeof value === "string", { message: `Expected an ID of ${table}` }),
};
