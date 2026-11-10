// The module map's skeleton of convex/website/collection.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { CrateStore } from "../album/hoggies/boughtCrates.ts";
import type { HeldCrest, HeldHoggie, RarityShare } from "../album/hoggies/collection.ts";
import type { WaitingPacks } from "../album/hoggies/waitingPacks.ts";
import type { Album } from "../stickers/albums.ts";
import type { TeamPageOf } from "../stickers/teamPages.ts";
import type { Face } from "./faces.ts";
import type { PageWaits } from "./unlockPath.ts";

export type CollectionHoggie = HeldHoggie & { seen: string | null };

export type CollectionCrest = HeldCrest & { seen: string | null };

export type Teammate = { name: string; face: Face; former: boolean };

export type Sticker = Teammate & { key: string; firstAt: number; seen: string };

export type AlbumPerson = Teammate & { key: string; held: boolean };

export type GroupAlbum = Omit<Album, "people"> & { people: AlbumPerson[] };

export type TeamPerson = { key: string; name: string; role: string | null; face: Face; lead: boolean; held: boolean; heldAt: number | null };

export type TeamPage = Omit<TeamPageOf, "people" | "crest" | "completion"> & { people: TeamPerson[]; crest: { collectedAt: number; seen: string } | null; completion?: { at: number; seen: string } | null };

export type StickerBook = { stickers?: Sticker[]; albums?: GroupAlbum[]; teams?: TeamPage[] };

export type BoughtCrates = { bought?: string[]; crateStore?: CrateStore | null };

export type PackStack = Partial<WaitingPacks>;

export type CollectionAnswer = { kind: "not-found" } | PageWaits | ({ kind: "collection"; rarities: RarityShare[]; hoggies: CollectionHoggie[]; owned: number; total: number; crests?: CollectionCrest[] } & BoughtCrates & PackStack & StickerBook);
