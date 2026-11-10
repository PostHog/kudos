import { hoggiesOfRarity, packBands, rankOf, rarities, weightsNamed, type CatalogueHoggie, type Rarity, type WeightsName } from "./catalogue.ts";
import { kindOf, type CrateKey } from "./crateKey.ts";

export type DrawInput = { secret: string; member: string; crate: string; version: number; floor?: Rarity; cap?: Rarity; weights?: WeightsName; owned?: ReadonlySet<string> };

export type Drawn = { rarity: Rarity; hoggie: string };

type Pool = { rarity: Rarity; weight: number; hoggies: CatalogueHoggie[] };

export type PackDrawInput = { secret: string; member: string; crate: CrateKey };

export type PackBonus = { xp: number; coins: number };

export type HugFindInput = { secret: string; member: string; hug: string };

const hugFindChance = 0.2;

export async function drawOf({ secret, member, crate, version, floor = "common", cap = "legendary", weights, owned = new Set() }: DrawInput): Promise<Drawn> {
  const digest = await digestOf(`${secret}:${member}:${crate}:${version}`);
  const pools = poolsBetween(floor, cap, weights);
  const { rarity, hoggies } = weights === undefined ? poolAt(fractionAt(digest, 0), skippingOwnedRarities(pools, owned)) : preferringUnowned(poolAt(fractionAt(digest, 0), pools), owned);
  return { rarity, hoggie: hoggies[pickAt(digest, 4, hoggies.length)]!.hoggie };
}

export type PickInput = { secret: string; member: string; crate: string; version: number; among: CatalogueHoggie[] };

export async function pickOf({ secret, member, crate, version, among }: PickInput): Promise<Drawn> {
  const digest = await digestOf(`${secret}:${member}:${crate}:${version}`);
  const { hoggie, rarity } = among[pickAt(digest, 0, among.length)]!;
  return { rarity, hoggie };
}

export async function packBonusOf({ secret, member, crate }: PackDrawInput): Promise<PackBonus | null> {
  const band = packBands[kindOf(crate)];
  if (band === null) return null;
  const { xp, coins, version } = band;
  const digest = await digestOf(`${secret}:${member}:${crate}:pack:${version}`);
  const xpSteps = (xp.most - xp.least) / xp.step + 1;
  return { xp: xp.least + xp.step * pickAt(digest, 0, xpSteps), coins: coins.least + pickAt(digest, 4, coins.most - coins.least + 1) };
}

export async function findsOnHug({ secret, member, hug }: HugFindInput): Promise<boolean> {
  return fractionAt(await digestOf(`${secret}:${member}:hug-find:${hug}`), 0) < hugFindChance;
}

async function digestOf(input: string) {
  return new DataView(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

function pickAt(digest: DataView, offset: number, choices: number) {
  return Math.floor(fractionAt(digest, offset) * choices);
}

function fractionAt(digest: DataView, offset: number) {
  return digest.getUint32(offset) / 2 ** 32;
}

function poolsBetween(floor: Rarity, cap: Rarity, weights: WeightsName = "base"): Pool[] {
  return weightsNamed[weights].filter(({ rarity }) => rankOf(rarity) >= rankOf(floor) && rankOf(rarity) <= rankOf(cap)).map(({ rarity, weight }) => ({ rarity, weight, hoggies: hoggiesOfRarity(rarity) }));
}

function skippingOwnedRarities(pools: Pool[], owned: ReadonlySet<string>): Pool[] {
  const unowned = pools.map((pool) => withoutOwned(pool, owned)).filter(({ hoggies }) => hoggies.length > 0);
  return unowned.length > 0 ? unowned : pools;
}

function preferringUnowned(pool: Pool, owned: ReadonlySet<string>): Pool {
  const unowned = withoutOwned(pool, owned);
  return unowned.hoggies.length > 0 ? unowned : pool;
}

function withoutOwned(pool: Pool, owned: ReadonlySet<string>): Pool {
  return { ...pool, hoggies: pool.hoggies.filter(({ hoggie }) => !owned.has(hoggie)) };
}

function poolAt(fraction: number, pools: Pool[]): Pool {
  const point = fraction * pools.reduce((total, { weight }) => total + weight, 0);
  let end = 0;
  for (const pool of pools) if (point < (end += pool.weight)) return pool;
  return pools.at(-1)!;
}
