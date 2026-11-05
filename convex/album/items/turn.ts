import type { Doc, Id } from "../../_generated/dataModel";
import { storedRangeOf } from "../hoggies/rarityCaps";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { hypeFaceOf, unlockHypeEmojiOf, type HypeEmoji } from "../earnedEmojis";
import { isTrayKey, openThePackOnceAllTurned, trayItemKeyed } from "../opening";
import { crateKeyOf } from "../packs";
import { markTrayStickerPutIn, placeFromTheTray, putStickerIn } from "../putIn";
import type { TeamSticker } from "../records";
import { isPutInFrom } from "../stickers";
import { tallyHoggieFound } from "../tallies";
import { teamPagesOf, type PageOwner, type TeamPage } from "../teamPages";
import { unlockReadyTeamsAmong } from "../teamStickers";
import { publish } from "../../bus/publish";
import type { CrateKey } from "../hoggies/crateKey";
import { dropFor, dropOf, foundIn, packOf, type Drop } from "../hoggies/drops";
import { crestsShownTo } from "../hoggies/flag";
import { dropForged } from "../hoggies/forge";
import type { AppliedReward } from "../../progression/rewards";
import type { MemberId } from "../../workspace/directory";
import { achievementHoggiesShownTo, isAnAchievement } from "./achievementFlag";
import { stickerWaitsFor } from "./ledger";
import { unlockMilestoneTiers } from "./milestoneUnlocks";
import type { UnlockedTier } from "../milestoneXp";

export type TurnedFace = { kind: "hoggie"; drop: Drop } | { kind: "sticker"; person: MemberId; isNew: boolean };

export type LandingPage = { kind: "hoggies" } | { kind: "team"; team: string } | { kind: "person"; person: MemberId };

export type UnlockedHype = HypeEmoji & { from: string };

export type Unlocked = { teamStickers: TeamSticker[]; hype: UnlockedHype | null; milestones: UnlockedTier[] };

export type Turned = { face: TurnedFace; applied: AppliedReward | null; page: LandingPage; unlocked: Unlocked; again: boolean };

type Item = Doc<"items">;

type Landed = { face: TurnedFace; applied: AppliedReward | null; page: LandingPage; teamStickers: TeamSticker[] };

type StickerItem = Item & { source: "sticker"; reason: { kind: "thanks" } };

const nothingUnlocked: Unlocked = { teamStickers: [], hype: null, milestones: [] };

export async function turn(ctx: MutationCtx, owner: PageOwner, item: Id<"items">, at: number): Promise<Turned | null> {
  const row = await ctx.db.get(item);
  if (row?.member !== owner.member) return null;
  if (row.turnedAt !== undefined) return turnedAgain(ctx, owner, row);
  if (isAnAchievement(row.reason) && !(await achievementHoggiesShownTo(ctx, owner.member))) return null;
  const landed = await landFirstTime(ctx, owner, row, at);
  if (landed === null) return null;
  const hype = await hypeUnlockedBy(ctx, owner, row, at);
  const milestones = await unlockMilestoneTiers(ctx, owner, at);
  await ctx.db.patch(row._id, { turnedAt: at });
  await openThePackOnceAllTurned(ctx, row, at);
  await publish(ctx, { type: "itemTurned", workspace: owner.workspace, member: owner.member, ...analyticsFaceOf(landed.face), at });
  return { face: landed.face, applied: landed.applied, page: landed.page, unlocked: { teamStickers: landed.teamStickers, hype, milestones }, again: false };
}

async function landFirstTime(ctx: MutationCtx, owner: PageOwner, row: Item, at: number): Promise<Landed | null> {
  if (isTrayHoggie(row)) return putTheTrayHoggieIn(ctx, owner, row, at);
  if (row.source === "hoggie") return drawTheHoggie(ctx, owner, row, at);
  return isStickerItem(row) ? putTheStickerIn(ctx, owner, row, at) : null;
}

async function drawTheHoggie(ctx: MutationCtx, owner: PageOwner, row: Item, at: number): Promise<Landed | null> {
  const crate = row.key as CrateKey;
  if (row.reason.kind === "forge") await dropForged(ctx, owner.member, crate, row.reason.hoggie, at);
  else await dropFor(ctx, owner.member, crate, at, { surface: "website", ...storedRangeOf(row), unowned: isAnAchievement(row.reason) });
  const drop = await dropOf(ctx, owner.member, crate);
  if (drop === null) return null;
  await tallyHoggieFound(ctx, owner.member, { hoggie: drop.hoggie, rarity: drop.rarity }, at);
  return { face: { kind: "hoggie", drop }, applied: await packOf(ctx, owner.member, crate), page: { kind: "hoggies" }, teamStickers: [] };
}

async function putTheTrayHoggieIn(ctx: MutationCtx, owner: PageOwner, row: Item, at: number): Promise<Landed | null> {
  const waiting = await trayItemKeyed(ctx, row.key);
  if (waiting?.member !== owner.member || waiting.putInAt !== undefined) return null;
  await placeFromTheTray(ctx, owner.workspace, waiting, at);
  const drop = await dropOf(ctx, owner.member, crateKeyOf(waiting.pack));
  return drop === null ? null : { face: { kind: "hoggie", drop }, applied: null, page: { kind: "hoggies" }, teamStickers: [] };
}

async function putTheStickerIn(ctx: MutationCtx, owner: PageOwner, row: StickerItem, at: number): Promise<Landed> {
  const person = row.reason.person;
  const pack = row.key as Id<"thoughtfulPacks">;
  const isNew = await putStickerIn(ctx, owner, person, pack, at);
  await markTrayStickerPutIn(ctx, pack, at);
  const holding = await pagesHolding(ctx, owner, person);
  const teamStickers = await unlockReadyTeamsAmong(ctx, owner, holding, at);
  const landing = holding.find(({ state }) => state === "ready") ?? holding[0];
  return { face: { kind: "sticker", person, isNew }, applied: null, page: landingPageOf(landing, person), teamStickers };
}

async function hypeUnlockedBy(ctx: MutationCtx, owner: PageOwner, row: Item, at: number): Promise<UnlockedHype | null> {
  if (row.reason.kind !== "thanks") return null;
  const person = row.reason.person;
  if (row.source === "hoggie" && (await stickerWaitsFor(ctx, owner.member, person))) return null;
  const hype = await unlockHypeEmojiOf(ctx, owner, person, at);
  return hype === null ? null : { ...hype, from: (await hypeFaceOf(ctx, owner.workspace, person)).name };
}

async function turnedAgain(ctx: MutationCtx, owner: PageOwner, row: Item): Promise<Turned | null> {
  if (isStickerItem(row)) return stickerTurnedAgain(ctx, owner, row);
  const crate = await crateOf(ctx, row);
  const drop = crate === null ? null : await foundIn(ctx, row.member, crate, { crests: await crestsShownTo(ctx, row.member) });
  return drop === null ? null : { face: { kind: "hoggie", drop }, applied: null, page: { kind: "hoggies" }, unlocked: nothingUnlocked, again: true };
}

async function crateOf(ctx: QueryCtx, row: Item): Promise<CrateKey | null> {
  if (!isTrayHoggie(row)) return row.key as CrateKey;
  const placed = await trayItemKeyed(ctx, row.key);
  return placed === null ? null : crateKeyOf(placed.pack);
}

function isTrayHoggie(row: Item): boolean {
  return row.source === "hoggie" && isTrayKey(row.key);
}

async function stickerTurnedAgain(ctx: QueryCtx, owner: PageOwner, row: StickerItem): Promise<Turned> {
  const person = row.reason.person;
  const isNew = await isPutInFrom(ctx, owner.member, person, row.key as Id<"thoughtfulPacks">);
  return { face: { kind: "sticker", person, isNew }, applied: null, page: landingPageOf((await pagesHolding(ctx, owner, person))[0], person), unlocked: nothingUnlocked, again: true };
}

function isStickerItem(row: Item): row is StickerItem {
  return row.source === "sticker" && row.reason.kind === "thanks";
}

async function pagesHolding(ctx: QueryCtx, owner: PageOwner, person: MemberId): Promise<TeamPage[]> {
  return (await teamPagesOf(ctx, owner)).filter(({ people }) => people.includes(person));
}

function landingPageOf(page: TeamPage | undefined, person: MemberId): LandingPage {
  return page === undefined ? { kind: "person", person } : { kind: "team", team: page.team };
}

function analyticsFaceOf(face: TurnedFace) {
  return face.kind === "hoggie" ? { source: "hoggie" as const, rarity: face.drop.rarity, isNew: face.drop.isNew } : { source: "sticker" as const, isNew: face.isNew };
}
