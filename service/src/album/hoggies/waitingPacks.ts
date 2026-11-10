// The packs a member hasn't opened yet, as today's convex/album/hoggies/waitingPacks.ts: ready feature crates and bought
// crates, longest waiting first, numbered, and the first 50 listed.
import { featureCrateKeyOf } from "../../unlocks/feature.ts";
import { readyFeaturesOf } from "../../unlocks/unlocks.ts";
import type { QueryContext } from "../../operations.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { boughtCratesWaitingFor } from "./boughtCrates.ts";
import { dropsAHoggie, kindOf, type CrateKey, type CrateKind } from "./crateKey.ts";

export type Pack = { crate: CrateKey; kind: CrateKind; n: number };

export type WaitingPacks = { packs: Pack[]; morePacks: boolean };

type Waiting = { crate: string; at: number };

type WaitingPack = { crate: CrateKey; at: number };

const packsListed = 50;

const readPerKind = packsListed + 1;

export async function waitingPacksOf(ctx: QueryContext, member: MemberId): Promise<WaitingPacks> {
  const features = await readyFeaturesOf(ctx, member, readPerKind);
  const waiting: Waiting[] = [
    ...features.map(({ feature, readyAt }) => ({ crate: featureCrateKeyOf(feature), at: readyAt })),
    ...(await boughtCratesWaitingFor(ctx, member, readPerKind)),
  ];
  const longestWaitingFirst = waiting.filter(isAPack).toSorted(byWaitingLongest);
  return { packs: longestWaitingFirst.slice(0, packsListed).map(numbered), morePacks: longestWaitingFirst.length > packsListed };
}

function isAPack(waiting: Waiting): waiting is WaitingPack {
  return dropsAHoggie(waiting.crate);
}

const crateKeyOrder = new Intl.Collator("en", { numeric: true });

function byWaitingLongest(first: WaitingPack, second: WaitingPack) {
  return first.at - second.at || crateKeyOrder.compare(first.crate, second.crate);
}

function numbered({ crate }: WaitingPack, index: number): Pack {
  return { crate, kind: kindOf(crate), n: index + 1 };
}
