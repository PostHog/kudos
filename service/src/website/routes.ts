import { z } from "zod";
import { zv } from "../values.ts";
import { weeklyQuestValidator } from "../quests/step.ts";
import { featureValidator, type Feature } from "../unlocks/feature.ts";
import type { pageValidator } from "./link.ts";
import { linkFrom, type VisitSource } from "./visitSource.ts";

export type Page = z.infer<typeof pageValidator>;

type CratePage = Extract<Page, { crate?: CrateTarget }>;

const namedCrateValidator = z.union([...featureValidator.options, z.literal("journey"), z.literal("group"), z.literal("store")]);

type NamedCrate = z.infer<typeof namedCrateValidator>;

const earlierGroupCrateValidator = z.strictObject({ kind: z.literal("group"), week: z.string() });

const boughtCrateValidator = z.strictObject({ kind: z.literal("bought"), n: zv.number() });

export type BoughtCrateTarget = z.infer<typeof boughtCrateValidator>;

export const crateTargetValidator = z.union([...namedCrateValidator.options, weeklyQuestValidator, earlierGroupCrateValidator, boughtCrateValidator]);

export type CrateTarget = z.infer<typeof crateTargetValidator>;

export const homePanelValidator = z.literal("inventory");

export type HomePanel = z.infer<typeof homePanelValidator>;

export const settingsSectionValidator = z.union([z.literal("visibility"), z.literal("messages"), z.literal("group"), z.literal("company-profile"), z.literal("admin"), z.literal("workspace")]);

export type SettingsSection = z.infer<typeof settingsSectionValidator>;

export const settingsSections: readonly SettingsSection[] = settingsSectionValidator.options.map(({ value }) => value);

const namedCrates: readonly NamedCrate[] = namedCrateValidator.options.map(({ value }) => value);

const weeklyCrateParam = /^weekly:(\d{4}-\d{2}-\d{2}):(\d+)$/;

const earlierGroupCrateParam = /^group:(\d{4}-\d{2}-\d{2})$/;

const boughtCrateParam = /^bought:(\d+)$/;

export function crateParamOf(crate: CrateTarget): string | undefined {
  if (typeof crate === "string") return crate;
  if (crate.kind === "weekly") return `weekly:${crate.week}:${crate.slot}`;
  if (crate.kind === "group") return `group:${crate.week}`;
  return isACrateNumber(crate.n) ? `bought:${crate.n}` : undefined;
}

export function crateTargetIn(param: string | null): CrateTarget | undefined {
  if (param === null) return undefined;
  return namedCrates.find((crate) => crate === param) ?? weeklyCrateIn(param) ?? earlierGroupCrateIn(param) ?? boughtCrateIn(param);
}

function weeklyCrateIn(param: string): CrateTarget | undefined {
  const weekly = weeklyCrateParam.exec(param);
  return weekly === null ? undefined : { kind: "weekly", week: weekly[1]!, slot: Number(weekly[2]) };
}

function boughtCrateIn(param: string): CrateTarget | undefined {
  const bought = boughtCrateParam.exec(param);
  const n = bought === null ? 0 : Number(bought[1]);
  return isACrateNumber(n) ? { kind: "bought", n } : undefined;
}

function isACrateNumber(n: number) {
  return Number.isSafeInteger(n) && n > 0;
}

export function boughtCrateTargetOf(crate: string): BoughtCrateTarget | undefined {
  const target = crateTargetIn(crate);
  return typeof target === "object" && target.kind === "bought" ? target : undefined;
}

function earlierGroupCrateIn(param: string): CrateTarget | undefined {
  const group = earlierGroupCrateParam.exec(param);
  return group === null ? undefined : { kind: "group", week: group[1]! };
}

export const routeList: readonly string[] = ["/", "/leaderboard", "/quests", "/skills", "/book", "/book/earned", "/book/collection", "/activity", "/settings"];

export const signInEntry = "/sign-in";

const pathOf: Record<Page["page"], string> = {
  home: "/",
  leaderboard: "/leaderboard",
  quests: "/quests",
  skillTree: "/skills",
  book: "/book",
  bookEarned: "/book/earned",
  bookCollection: "/book/collection",
  settings: "/settings",
  levelUp: "/book",
};

const albumAddressOf: Record<Page["page"], string> = {
  home: "/",
  leaderboard: "/leaderboard",
  quests: "/",
  skillTree: "/",
  book: "/",
  bookEarned: "/book#milestones",
  bookCollection: "/book#hoggies",
  settings: "/settings",
  levelUp: "/book",
};

const featurePages: Partial<Record<Feature, CratePage>> = {
  quests: { page: "quests" },
  leaderboard: { page: "leaderboard", period: "week" },
  book: { page: "book" },
  skillTree: { page: "skillTree" },
};

export function listed(page: Page): boolean {
  return routeList.includes(pathOf[page.page]);
}

export function routeOf(page: Page): string {
  if (page.page === "settings" && page.section !== undefined) return `${albumAddressOf.settings}?section=${page.section}`;
  if (page.page === "levelUp") return `${albumAddressOf.levelUp}#level-up/${page.level}`;
  return albumAddressOf[page.page];
}

export function listedPageOf(feature: Feature): CratePage | null {
  const page = featurePages[feature];
  return page !== undefined && listed(page) ? page : null;
}

export function readyCratePageOf(feature: Feature): Page {
  const page = listedPageOf(feature);
  return page === null ? { page: "home" } : { ...page, crate: feature };
}

export function boughtCratePageOf(crate: string): Page {
  const target = boughtCrateTargetOf(crate);
  return target === undefined ? { page: "bookCollection" } : { page: "bookCollection", crate: target };
}

export function crateOfferPageOf(): Page {
  return { page: "bookCollection", crate: "store" };
}

export function urlOf(origin: string, page: Page, source: VisitSource) {
  return linkFrom(source, `${origin}${routeOf(page)}`);
}
