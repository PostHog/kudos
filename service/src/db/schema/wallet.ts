// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";

export const wallets = documentTable(
  "wallets",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    balance: f64().notNull(),
  },
  (t) => [
    index("wallets_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const coinSpends = documentTable(
  "coinSpends",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    coins: f64().notNull(),
    for: value().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("coinSpends_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export interface WalletDocuments {
  wallets: { _id: Id<"wallets">; _creationTime: number } & ({ "member": Id<"members">; "balance": number });
  coinSpends: { _id: Id<"coinSpends">; _creationTime: number } & ({ "member": Id<"members">; "coins": number; "for": { "perk": "spark" | "rhythm" | "circle" | "flame" | "cadence" | "bridge" | "treasurer" | "banker" } | { "item": string } | { "crate": string }; "at": number });
}
