import { z } from "zod";
import type { CrateKind } from "./crateKey.ts";

export const rarityValidator = z.union([z.literal("common"), z.literal("uncommon"), z.literal("rare"), z.literal("epic"), z.literal("legendary")]);

export type Rarity = z.infer<typeof rarityValidator>;

export type CatalogueHoggie = { hoggie: string; name: string; rarity: Rarity };

export type CatalogueCrest = { crest: string; name: string; roster: readonly string[] };

export const rarities: ReadonlyArray<{ rarity: Rarity; weight: number }> = [
  { rarity: "common", weight: 50 },
  { rarity: "uncommon", weight: 28 },
  { rarity: "rare", weight: 14 },
  { rarity: "epic", weight: 6 },
  { rarity: "legendary", weight: 2 },
];

export const kudosPackWeights: ReadonlyArray<{ rarity: Rarity; weight: number }> = [
  { rarity: "common", weight: 50 },
  { rarity: "uncommon", weight: 28 },
  { rarity: "rare", weight: 18 },
  { rarity: "epic", weight: 3.5 },
  { rarity: "legendary", weight: 0.5 },
];

export const weightsNameValidator = z.union([z.literal("base"), z.literal("kudos")]);

export type WeightsName = z.infer<typeof weightsNameValidator>;

export const weightsNamed: Record<WeightsName, ReadonlyArray<{ rarity: Rarity; weight: number }>> = { base: rarities, kudos: kudosPackWeights };

const words: Record<Rarity, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };

const squares: Record<Rarity, string> = { common: "⬜", uncommon: "🟩", rare: "🟦", epic: "🟪", legendary: "🟧" };

const versionOne: Record<Rarity, ReadonlyArray<readonly [hoggie: string, name: string]>> = {
  common: [
    ["asleep", "Asleep"],
    ["ball", "Ball"],
    ["banana", "Banana"],
    ["beaker", "Beaker"],
    ["burger", "Burger"],
    ["card", "Card"],
    ["cereal", "Cereal"],
    ["chart", "Chart"],
    ["coconut", "Coconut"],
    ["code-bubble", "Code Bubble"],
    ["coffee-cup", "Coffee Cup"],
    ["coffee-run", "Coffee Run"],
    ["commuter", "Commuter"],
    ["construction", "Construction"],
    ["croissant", "Croissant"],
    ["cursor", "Cursor"],
    ["doll-house", "Doll House"],
    ["error", "Error"],
    ["experiment", "Experiment"],
    ["gardener", "Gardener"],
    ["heart", "Heart"],
    ["honey", "Honey"],
    ["hooligan", "Hooligan"],
    ["hoot", "Hoot"],
    ["hot-popcorn", "Hot / Popcorn"],
    ["hourglass", "Hourglass"],
    ["ipad", "Ipad"],
    ["lemonade", "Lemonade"],
    ["magnifying-glass", "Magnifying Glass"],
    ["mailbox", "Mailbox"],
    ["megaphone", "Megaphone"],
    ["money", "Money"],
    ["office-worker", "Office Worker"],
    ["organized", "Organized"],
    ["panic", "Panic"],
    ["party", "Party"],
    ["pearl-necklace", "Pearl Necklace"],
    ["phone-call", "Phone Call"],
    ["reading", "Reading"],
    ["remote-work", "Remote Work"],
    ["research", "Research"],
    ["self-driving", "Self-driving"],
    ["selfie", "Selfie"],
    ["shocked", "Shocked"],
    ["sitting", "Sitting"],
    ["sleepy", "Sleepy"],
    ["soccer-coach", "Soccer Coach"],
    ["speaker", "Speaker"],
    ["stamp-approved", "Stamp Approved"],
    ["stamp-denied", "Stamp Denied"],
    ["star", "Star"],
    ["stop", "Stop"],
    ["success", "Success"],
    ["sunburn", "Sunburn"],
    ["survey", "Survey"],
    ["toilet", "Toilet"],
    ["traffic-police", "Traffic Police"],
    ["trenchcoat", "Trenchcoat"],
    ["waiter", "Waiter"],
    ["workflows", "Workflows"],
  ],
  uncommon: [
    ["basketball-coach", "Basketball Coach"],
    ["burning-money", "Burning Money"],
    ["cake", "Cake"],
    ["caribana", "Caribana"],
    ["chef", "Chef"],
    ["climber", "Climber"],
    ["coding-group", "Coding Group"],
    ["cowboy-lasso", "Cowboy Lasso"],
    ["dadd-ai", "Dadd Ai"],
    ["data-thief", "Data Thief"],
    ["doctor", "Doctor"],
    ["drake-nah", "Drake Nah"],
    ["drake-yah", "Drake Yah"],
    ["dynamite", "Dynamite"],
    ["einstein", "Einstein"],
    ["explorer", "Explorer"],
    ["float", "Float"],
    ["football-coach", "Football Coach"],
    ["football-player", "Football Player"],
    ["gravedigger", "Gravedigger"],
    ["greek", "Greek"],
    ["haha-bizzniss", "Haha Bizzniss"],
    ["hand-clasp", "Hand Clasp"],
    ["hipster", "Hipster"],
    ["judge", "Judge"],
    ["lemon-wrangler", "Lemon Wrangler"],
    ["lifeguard", "Lifeguard"],
    ["loops", "Loops"],
    ["namaste", "Namaste"],
    ["pit-viper", "Pit Viper"],
    ["reporter", "Reporter"],
    ["safari", "Safari"],
    ["scientist", "Scientist"],
    ["scorpion", "Scorpion"],
    ["soapbox", "Soapbox"],
    ["surfer", "Surfer"],
    ["swimmer", "Swimmer"],
    ["tourist", "Tourist"],
    ["town-crier", "Town Crier"],
    ["traffic-controller", "Traffic Controller"],
  ],
  rare: [
    ["70s-dance", "70's Dance"],
    ["996", "996"],
    ["ape", "Ape"],
    ["art-thief", "Art Thief"],
    ["boombox", "Boombox"],
    ["business-evolution", "Business Evolution"],
    ["campfire-cowboy", "Campfire Cowboy"],
    ["caveman", "Caveman"],
    ["cool-car", "Cool Car"],
    ["desk-wizard", "Desk Wizard"],
    ["director", "Director"],
    ["dj", "Dj"],
    ["doc-brown", "Doc Brown"],
    ["einstein-group", "Einstein Group"],
    ["gatsby", "Gatsby"],
    ["hogpatch", "Hogpatch"],
    ["im-the-driver", "I'm The Driver"],
    ["mountie", "Mountie"],
    ["mr-potato-head", "Mr Potato Head"],
    ["noir", "Noir"],
    ["pinata", "Piñata"],
    ["puzzle", "Puzzle"],
    ["reading-is-magic", "Reading Is Magic"],
    ["robot", "Robot"],
    ["roller-coaster", "Roller Coaster"],
    ["rose", "Rose"],
    ["sailor", "Sailor"],
    ["two-player", "Two Player"],
    ["will-smith", "Will Smith"],
    ["x-ray", "X-ray"],
  ],
  epic: [
    ["angel", "Angel"],
    ["back-to-the-future", "Back To The Future"],
    ["driving-hogzilla", "Driving Hogzilla"],
    ["evel", "Evel"],
    ["gladiator", "Gladiator"],
    ["jack-dawson", "Jack Dawson"],
    ["katy-perry", "Katy Perry"],
    ["level-up", "Level Up"],
    ["oprah", "Oprah"],
    ["pope", "Pope"],
    ["reaper", "Reaper"],
    ["scott-pilgrim", "Scott Pilgrim"],
    ["steve-jobs", "Steve Jobs"],
    ["terminator", "Terminator"],
    ["the-bride", "The Bride"],
  ],
  legendary: [
    ["dr-manhattan", "Dr. Manhattan"],
    ["final-evolution", "Final Evolution"],
    ["rocket", "Rocket"],
    ["superhero", "Superhero"],
    ["transformer", "Transformer"],
    ["wizard", "Wizard"],
  ],
};

const versionTwoCrests: ReadonlyArray<readonly [crest: string, name: string, roster: readonly string[]]> = [
  ["ai-gateway", "AI Gateway", ["transformer", "traffic-controller", "cursor"]],
  ["ai-observability", "AI Observability", ["robot", "noir", "magnifying-glass"]],
  ["ai-research", "AI Research", ["research", "scientist", "einstein", "reading-is-magic"]],
  ["analytics-platform", "Analytics Platform", ["einstein-group", "hourglass", "coffee-cup"]],
  ["apm", "APM", ["roller-coaster", "dynamite"]],
  ["batch-exports", "Batch Exports", ["coffee-run", "waiter"]],
  ["billing", "Billing", ["money", "burning-money", "gatsby"]],
  ["blitzscale", "Blitzscale", ["rocket", "level-up", "pit-viper"]],
  ["builder-relations", "Builder Relations", ["hand-clasp", "puzzle", "honey"]],
  ["clickhouse", "Clickhouse", ["x-ray", "doll-house", "gravedigger"]],
  ["client-libraries", "Client Libraries", ["dj", "code-bubble", "coding-group"]],
  ["cloud-foundations", "Cloud Foundations", ["construction", "climber"]],
  ["cloud-platform", "Cloud Platform", ["float", "remote-work", "katy-perry"]],
  ["conversations", "Conversations", ["mailbox", "phone-call", "speaker"]],
  ["customer-analytics", "Customer Analytics", ["oprah", "commuter", "selfie"]],
  ["customer-success-eu", "Customer Success EU", ["gladiator", "croissant", "hooligan"]],
  ["customer-success-na", "Customer Success NA", ["mountie", "burger", "football-player"]],
  ["data-modeling", "Data Modeling", ["organized", "mr-potato-head", "office-worker"]],
  ["data-tools", "Data Tools", ["dr-manhattan", "doc-brown", "data-thief"]],
  ["demand-gen", "Demand Gen", ["cowboy-lasso", "town-crier", "lemonade"]],
  ["dev-experience", "Dev Experience", ["996", "cereal", "hipster"]],
  ["editorial", "Editorial", ["reporter", "greek", "soapbox"]],
  ["error-tracking", "Error Tracking", ["error", "panic", "stop", "reaper"]],
  ["experiments", "Experiments", ["experiment", "beaker", "doctor"]],
  ["feature-flags", "Feature Flags", ["drake-nah", "drake-yah", "card"]],
  ["forward-deployed-engineering", "Forward Deployed Engineering", ["explorer", "safari", "campfire-cowboy"]],
  ["graphics", "Graphics", ["jack-dawson", "art-thief", "caribana"]],
  ["growth", "Growth", ["final-evolution", "ape", "caveman", "success"]],
  ["gtm-engineering", "GTM Engineering", ["trenchcoat", "ipad"]],
  ["ingestion", "Ingestion", ["chef", "toilet"]],
  ["managed-warehouse", "Managed Warehouse", ["swimmer", "the-bride"]],
  ["marketing", "Marketing", ["megaphone", "party", "cake"]],
  ["mcp-analytics", "MCP Analytics", ["pope", "banana"]],
  ["new-business-sales", "New Business Sales", ["steve-jobs", "business-evolution", "haha-bizzniss"]],
  ["onboarding", "Onboarding", ["tourist", "sitting"]],
  ["people-ops", "People & Ops", ["heart", "namaste", "coconut"]],
  ["platform-features", "Platform Features", ["superhero", "pearl-necklace"]],
  ["platform-ux", "Platform UX", ["rose", "ball"]],
  ["posthog-desktop", "Posthog Desktop", ["evel", "asleep", "two-player"]],
  ["product-analytics", "Product Analytics", ["chart", "back-to-the-future", "sailor"]],
  ["product-lead-sales-east", "Product Lead Sales East", ["dadd-ai", "will-smith"]],
  ["product-led-sales-west", "Product Led Sales West", ["lemon-wrangler", "scorpion"]],
  ["replay", "Replay", ["director", "hot-popcorn", "sleepy"]],
  ["security", "Security", ["traffic-police", "stamp-denied", "judge"]],
  ["self-driving", "Self-driving", ["self-driving", "driving-hogzilla", "cool-car", "im-the-driver"]],
  ["support", "Support", ["lifeguard", "angel"]],
  ["surveys", "Surveys", ["survey", "stamp-approved", "star"]],
  ["talent", "Talent", ["basketball-coach", "football-coach", "soccer-coach"]],
  ["warehouse-sources", "Warehouse Sources", ["pinata", "hoot"]],
  ["web-analytics", "Web Analytics", ["surfer", "sunburn"]],
  ["website", "Website", ["hogpatch", "gardener"]],
  ["wizard-docs", "Wizard & Docs", ["wizard", "desk-wizard", "reading"]],
  ["workflows", "Workflows", ["workflows", "loops", "terminator"]],
  ["youtube", "Youtube", ["scott-pilgrim", "boombox", "70s-dance", "shocked"]],
];

export const catalogue = {
  version: 2,
  hoggies: rarities.flatMap(({ rarity }) => versionOne[rarity].map(([hoggie, name]): CatalogueHoggie => ({ hoggie, name, rarity }))),
  crests: versionTwoCrests.map(([crest, name, roster]): CatalogueCrest => ({ crest, name, roster })),
  cratePrice: 50,
} as const;

export const firstVersionWithCrests = 2;

export const sparesForged = 3;

export type PackBand = { xp: { least: number; most: number; step: number }; coins: { least: number; most: number }; version: number };

const everyKindsFirstBand: PackBand = { xp: { least: 5, most: 25, step: 5 }, coins: { least: 1, most: 5 }, version: 1 };

const thoughtfulBand: PackBand = { xp: { least: 15, most: 15, step: 5 }, coins: { least: 0, most: 0 }, version: 2 };

export const packBands: Record<CrateKind, PackBand | null> = { weekly: everyKindsFirstBand, group: everyKindsFirstBand, journey: everyKindsFirstBand, unlock: everyKindsFirstBand, bought: everyKindsFirstBand, thoughtful: thoughtfulBand, level: null, welcome: null, team: null, milestone: null, forge: null, quest: null, "hug-find": null };

export function rarityLabel(rarity: Rarity): string {
  return `${squares[rarity]} ${words[rarity]}`;
}

export function rarityWord(rarity: Rarity): string {
  return words[rarity];
}

export function rarityAbove(rarity: Rarity): Rarity | null {
  return rarities[rankOf(rarity) + 1]?.rarity ?? null;
}

export function forgedRarityOf(rarity: Rarity, upTo: Rarity): Rarity | null {
  const into = rarityAbove(rarity);
  return into !== null && rankOf(into) <= rankOf(upTo) ? into : null;
}

export function rankOf(rarity: Rarity): number {
  return rarities.findIndex((entry) => entry.rarity === rarity);
}

export function hoggiesOfRarity(rarity: Rarity): CatalogueHoggie[] {
  return catalogue.hoggies.filter((entry) => entry.rarity === rarity);
}

export function hoggieNamed(hoggie: string): CatalogueHoggie | undefined {
  return catalogue.hoggies.find((entry) => entry.hoggie === hoggie);
}

export function crestWith(hoggie: string): CatalogueCrest | undefined {
  return catalogue.crests.find(({ roster }) => roster.includes(hoggie));
}

export function crestNamed(crest: string): CatalogueCrest | undefined {
  return catalogue.crests.find((entry) => entry.crest === crest);
}
