import { describe, expect, test } from "vitest";
import { catalogue, hoggiesOfRarity, rarities, rarityLabel, type Rarity } from "./catalogue.ts";
import { drawOf } from "./draw.ts";

const member = "k57abc0000000000000000000000000";

const appendixRosters: Record<string, string[]> = {
  "ai-gateway": ["transformer", "traffic-controller", "cursor"],
  "ai-observability": ["robot", "noir", "magnifying-glass"],
  "ai-research": ["research", "scientist", "einstein", "reading-is-magic"],
  "analytics-platform": ["einstein-group", "hourglass", "coffee-cup"],
  "apm": ["roller-coaster", "dynamite"],
  "batch-exports": ["coffee-run", "waiter"],
  "billing": ["money", "burning-money", "gatsby"],
  "blitzscale": ["rocket", "level-up", "pit-viper"],
  "builder-relations": ["hand-clasp", "puzzle", "honey"],
  "clickhouse": ["x-ray", "doll-house", "gravedigger"],
  "client-libraries": ["dj", "code-bubble", "coding-group"],
  "cloud-foundations": ["construction", "climber"],
  "cloud-platform": ["float", "remote-work", "katy-perry"],
  "conversations": ["mailbox", "phone-call", "speaker"],
  "customer-analytics": ["oprah", "commuter", "selfie"],
  "customer-success-eu": ["gladiator", "croissant", "hooligan"],
  "customer-success-na": ["mountie", "burger", "football-player"],
  "data-modeling": ["organized", "mr-potato-head", "office-worker"],
  "data-tools": ["dr-manhattan", "doc-brown", "data-thief"],
  "demand-gen": ["cowboy-lasso", "town-crier", "lemonade"],
  "dev-experience": ["996", "cereal", "hipster"],
  "editorial": ["reporter", "greek", "soapbox"],
  "error-tracking": ["error", "panic", "stop", "reaper"],
  "experiments": ["experiment", "beaker", "doctor"],
  "feature-flags": ["drake-nah", "drake-yah", "card"],
  "forward-deployed-engineering": ["explorer", "safari", "campfire-cowboy"],
  "graphics": ["jack-dawson", "art-thief", "caribana"],
  "growth": ["final-evolution", "ape", "caveman", "success"],
  "gtm-engineering": ["trenchcoat", "ipad"],
  "ingestion": ["chef", "toilet"],
  "managed-warehouse": ["swimmer", "the-bride"],
  "marketing": ["megaphone", "party", "cake"],
  "mcp-analytics": ["pope", "banana"],
  "new-business-sales": ["steve-jobs", "business-evolution", "haha-bizzniss"],
  "onboarding": ["tourist", "sitting"],
  "people-ops": ["heart", "namaste", "coconut"],
  "platform-features": ["superhero", "pearl-necklace"],
  "platform-ux": ["rose", "ball"],
  "posthog-desktop": ["evel", "asleep", "two-player"],
  "product-analytics": ["chart", "back-to-the-future", "sailor"],
  "product-lead-sales-east": ["dadd-ai", "will-smith"],
  "product-led-sales-west": ["lemon-wrangler", "scorpion"],
  "replay": ["director", "hot-popcorn", "sleepy"],
  "security": ["traffic-police", "stamp-denied", "judge"],
  "self-driving": ["self-driving", "driving-hogzilla", "cool-car", "im-the-driver"],
  "support": ["lifeguard", "angel"],
  "surveys": ["survey", "stamp-approved", "star"],
  "talent": ["basketball-coach", "football-coach", "soccer-coach"],
  "warehouse-sources": ["pinata", "hoot"],
  "web-analytics": ["surfer", "sunburn"],
  "website": ["hogpatch", "gardener"],
  "wizard-docs": ["wizard", "desk-wizard", "reading"],
  "workflows": ["workflows", "loops", "terminator"],
  "youtube": ["scott-pilgrim", "boombox", "70s-dance", "shocked"],
};

describe("CL2 CL3 CL4: catalogue version 1", () => {
  test("CL3: the five rarities run common to legendary, each shown by a coloured square and its word", () => {
    expect(rarities.map(({ rarity }) => rarityLabel(rarity))).toEqual(["⬜ Common", "🟩 Uncommon", "🟦 Rare", "🟪 Epic", "🟧 Legendary"]);
  });

  test("CL4: the weights are 50, 28, 14, 6 and 2, adding up to 100", () => {
    expect(Object.fromEntries(rarities.map(({ rarity, weight }) => [rarity, weight]))).toEqual({ common: 50, uncommon: 28, rare: 14, epic: 6, legendary: 2 });
  });

  test("CL2 CL4: version 1 holds 151 distinct hoggies, the appendix's count of each rarity, so every weight can be drawn", () => {
    expect(new Set(catalogue.hoggies.map(({ hoggie }) => hoggie)).size).toBe(151);
    expect(Object.fromEntries(rarities.map(({ rarity }) => [rarity, hoggiesOfRarity(rarity).length]))).toEqual({ common: 60, uncommon: 40, rare: 30, epic: 15, legendary: 6 });
  });

  test("CL2: catalogue order within a rarity is the appendix's", () => {
    expect(hoggiesOfRarity("legendary").map(({ hoggie }) => hoggie)).toEqual(["dr-manhattan", "final-evolution", "rocket", "superhero", "transformer", "wizard"]);
    expect(hoggiesOfRarity("common").at(-1)?.hoggie).toBe("workflows");
  });
});

describe("CL22: catalogue version 2's crests", () => {
  test("version 2 adds 54 crests, the pinned package's apart from its placeholder, keeping the hoggies, rarities and weights", () => {
    expect(catalogue.version).toBe(2);
    expect(new Set(catalogue.crests.map(({ crest }) => crest)).size).toBe(54);
    expect(catalogue.crests.map(({ crest }) => crest)).not.toContain("a-default-crest");
    expect(catalogue.hoggies).toHaveLength(151);
  });

  test("the rosters partition the version 1 hoggies, two to four on each", () => {
    const onRosters = catalogue.crests.flatMap((entry) => entry.roster);

    expect(onRosters.toSorted()).toEqual(catalogue.hoggies.map(({ hoggie }) => hoggie).toSorted());
    for (const entry of catalogue.crests) expect(entry.roster.length, entry.crest).toBeGreaterThanOrEqual(2);
    for (const entry of catalogue.crests) expect(entry.roster.length, entry.crest).toBeLessThanOrEqual(4);
  });

  test("the rosters are the appendix's, frozen, in its order", () => {
    expect(Object.fromEntries(catalogue.crests.map(({ crest, roster }) => [crest, roster]))).toEqual(appendixRosters);
    expect(catalogue.crests.map(({ crest }) => crest)).toEqual(Object.keys(appendixRosters));
    expect(catalogue.crests.find(({ crest }) => crest === "people-ops")).toEqual({ crest: "people-ops", name: "People & Ops", roster: ["heart", "namaste", "coconut"] });
  });

  test("each roster mixes rarities: at most one legendary, and at least one common or uncommon", () => {
    const rarityOf = (hoggie: string) => catalogue.hoggies.find((entry) => entry.hoggie === hoggie)!.rarity;
    for (const { crest, roster: hoggies } of catalogue.crests) {
      expect(hoggies.filter((hoggie) => rarityOf(hoggie) === "legendary").length, crest).toBeLessThanOrEqual(1);
      expect(hoggies.some((hoggie) => ["common", "uncommon"].includes(rarityOf(hoggie))), crest).toBe(true);
    }
  });
});

describe("CL8: the draw", () => {
  test("the same secret, member, crate and version draw the same hoggie", async () => {
    const crate = "journey:first-thanks";

    expect(await drawOf({ secret: "s", member, crate, version: 1 })).toEqual(await drawOf({ secret: "s", member, crate, version: 1 }));
  });

  test("the drawn hoggie is one of the drawn rarity's", async () => {
    const drawn = await drawOf({ secret: "", member, crate: "weekly:2026-10-12:0", version: 1 });

    expect(hoggiesOfRarity(drawn.rarity).map(({ hoggie }) => hoggie)).toContain(drawn.hoggie);
  });

  test("over 10,000 crate keys, each rarity's share is within one percentage point of its weight", async () => {
    const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
    for (let crate = 0; crate < 10_000; crate++) counts[(await drawOf({ secret: "", member, crate: `weekly:2026-10-12:${crate}`, version: 1 })).rarity]++;

    for (const { rarity, weight } of rarities) expect(Math.abs(counts[rarity] / 100 - weight), rarity).toBeLessThanOrEqual(1);
  });

  test("with a rare floor, over 10,000 crate keys, only rare, epic and legendary draw, each within one percentage point of its share of their weights", async () => {
    const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
    for (let crate = 0; crate < 10_000; crate++) counts[(await drawOf({ secret: "", member, crate: `level:${crate}:3`, version: 1, floor: "rare" })).rarity]++;

    expect({ common: counts.common, uncommon: counts.uncommon }).toEqual({ common: 0, uncommon: 0 });
    for (const [rarity, weight] of [["rare", 14], ["epic", 6], ["legendary", 2]] as const) expect(Math.abs(counts[rarity] / 100 - (weight / 22) * 100), rarity).toBeLessThanOrEqual(1);
  });

  test("a different secret draws differently for the same crates", async () => {
    const crates = Array.from({ length: 20 }, (_, slot) => `weekly:2026-10-12:${slot}`);
    const drawnWith = (secret: string) => Promise.all(crates.map((crate) => drawOf({ secret, member, crate, version: 1 })));

    expect(await drawnWith("one deployment")).not.toEqual(await drawnWith("another deployment"));
  });

  test.each([
    { secret: "s", crate: "unlock:book", rarity: "common", hoggie: "burger" },
    { secret: "s", crate: "weekly:2026-10-12:0", rarity: "uncommon", hoggie: "basketball-coach" },
    { secret: "s", crate: "weekly:2026-10-12:12", rarity: "rare", hoggie: "puzzle" },
    { secret: "s", crate: "weekly:2026-10-12:1", rarity: "epic", hoggie: "katy-perry" },
    { secret: "s", crate: "weekly:2026-10-12:5", rarity: "legendary", hoggie: "transformer" },
    { secret: "", crate: "journey:first-thanks", rarity: "epic", hoggie: "the-bride" },
  ])("version 1 with secret '$secret' draws $hoggie ($rarity) for $crate, as the appendix's order and CL8's SHA-256 steps fix it", async ({ secret, crate, rarity, hoggie }) => {
    expect(await drawOf({ secret, member, crate, version: 1 })).toEqual({ rarity, hoggie });
  });
});
