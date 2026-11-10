// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";

export const collection = documentTable(
  "collection",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    item: str().notNull(),
    source: str().$type<"store" | "tier">().notNull(),
    arrivedAt: f64().notNull(),
  },
  (t) => [
    index("collection_by_member_item").on(t.member, t.item, t._creationTime, t._id),
  ],
);

export const itemPurchases = documentTable(
  "itemPurchases",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    key: str().notNull(),
    outcome: value().notNull(),
  },
  (t) => [
    index("itemPurchases_by_member_key").on(t.member, t.key, t._creationTime, t._id),
  ],
);

export const customKudosEmoji = documentTable(
  "customKudosEmoji",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    name: str().notNull(),
    url: str().notNull(),
    pickedAt: f64().notNull(),
    unpickedAt: f64(),
  },
  (t) => [
    index("customKudosEmoji_by_workspace_name").on(t.workspace, t.name, t._creationTime, t._id),
  ],
);

export interface StoreDocuments {
  collection: { _id: Id<"collection">; _creationTime: number } & ({ "member": Id<"members">; "item": string; "source": "store" | "tier"; "arrivedAt": number });
  itemPurchases: { _id: Id<"itemPurchases">; _creationTime: number } & ({ "member": Id<"members">; "key": string; "outcome": { "kind": "bought"; "item": string } | { "kind": "refused"; "item": string; "reason": "coins-not-open" | "not-for-sale" | "owned" | "no-coins" } });
  customKudosEmoji: { _id: Id<"customKudosEmoji">; _creationTime: number } & ({ "workspace": string; "name": string; "url": string; "pickedAt": number; "unpickedAt"?: number });
}
