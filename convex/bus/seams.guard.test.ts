// @vitest-environment node
import ts from "typescript5";
import { describe, expect, test } from "vitest";
import schema from "../schema";

const sources = import.meta.glob<string>(["/convex/**/*.ts", "!/convex/_generated/**", "!/convex/**/*.test.ts"], { query: "?raw", import: "default", eager: true });

const placesThatWriteRewards = ["progression", "wallet", "album/items", "album/hoggies"];

const tablesOf: Record<string, string[]> = {
  achievements: ["bookLaunches", "ladderCounts", "ladderMarks", "countedAwards", "bookBatches", "bookReplays", "bookReplayCursors", "earnedTiers"],
  album: ["thoughtfulGiverCounts", "thoughtfulPacks", "trayItems", "grantRecords", "grantsTold", "thoughtfulTallies", "thoughtfulBoardTallies", "boardCountedAwards", "albumStickers", "teamStickers", "milestoneTiers", "emojiNames", "secondEmojiNames", "emojiNameNumbers", "seenEmojis", "kudosEmojiPicks", "emojiClasses", "randomEmojiDrops", "albumHistory", "pairTallies", "weekTallies", "weekPeople", "talliedAwards", "talliedHugs", "hypeReactions", "hypesCollected", "items", "drops", "hoggieTallies", "dropTallies", "trayDrops", "hoggieAvatars", "petHoggies", "boughtCrates"],
  analytics: ["analyticsIds", "workspaceKeys", "analyticsOutbox", "recordedFacts", "analyticsDrain", "errorSweep", "watchedJobs", "reportedJobs", "flagExposures"],
  bus: ["replays"],
  companyProfiles: ["companyProfiles", "companyTeams", "companyFaces", "companyProfileLinks"],
  engine: ["kudosMessages", "kudosTexts", "wordDeletionRequests", "spotlightDraws", "awards", "kudosTotals", "allowanceSpending"],
  feedback: ["welcomeNudges", "indicators", "privateReplies", "oneReplies", "publicReplies", "tierNotices", "tierSummaries", "homes", "homeSelections", "sentNotices", "grantReplies", "celebratedLevels"],
  groups: ["userGroupDepartures", "groupCountingChanges", "memberGroups", "groupSettings", "primaryGroupHistory", "attributions"],
  hugs: ["hugWeeks", "hugWeekMessages", "hugCounts", "hugs", "hugPeople", "hugsReceived"],
  leaderboard: ["countedKudosGiven", "countedRecognitions", "givenByDay", "attributedTotals", "attributedGroupTotals", "countedAttributions", "givenTotals", "hugRunningTotals", "mondayPostSettings", "mondayPostClaims", "featuredNewGivers", "weekThankers", "leaderboardSettings"],
  messageSettings: ["progressSettings", "messageSettings"],
  mondayDm: ["mondayDms", "mondayDmNudges"],
  progression: ["effectsRecords", "rewardRecords", "receivingGivers", "effectsBackfill", "memberProgress", "perksOwned", "perkPurchases"],
  quests: ["questStarts", "questDraws", "questProgress", "questsJudged", "questFinishes", "questRecognitions", "hugLadders", "questSideDraws"],
  slack: ["memberVerifications", "firstSignIns", "slackReceipts", "placedReactions", "slackRateLimits", "cardPictures"],
  stickers: ["stickers", "stickerBackfills", "teamPageCompletions", "teamPageChecks"],
  store: ["collection", "itemPurchases", "customKudosEmoji"],
  unlocks: ["unlocks", "unlockLaunches", "previewMoments", "levelUps"],
  wallet: ["wallets", "coinSpends"],
  website: ["users", "authAccounts", "authSessions", "authVerificationCodes", "authVerifiers", "authRefreshTokens", "authRateLimits", "websiteClock", "lastVisits", "howItWorksCloses"],
  welcome: ["welcomes"],
  workspace: ["workspaces", "members", "listedMembers", "userGroups", "userGroupMembers", "customEmoji", "customEmojiListings", "welcomeNudgeSwitches", "celebrationsSwitches"],
};

const allowed: string[] = [
  "convex/achievements/replay.ts table:members",
  "convex/achievements/tierCoins.ts recordReward",
  "convex/achievements/tierEmoji.ts recordReward",
  "convex/album/emojiWizard.ts table:memberProgress",
  "convex/commands/commands.ts buyCrate",
  "convex/commands/commands.ts buyPerk",
  "convex/commands/commands.ts openCrate",
  "convex/commands/commands.ts setAvatar",
  "convex/commands/commands.ts xpLevelsShownTo",
  "convex/companyProfiles/storedFaces.ts table:workspaces",
  "convex/feedback/coins.ts coinsShownTo",
  "convex/feedback/homes.ts coinsVisibleAndExposedTo",
  "convex/feedback/homes.ts skillTreeShownTo",
  "convex/feedback/homes.ts xpLevelsShownTo",
  "convex/feedback/notify.ts xpLevelsShownTo",
  "convex/feedback/replies.ts coinsShownTo",
  "convex/feedback/replies.ts xpLevelsShownTo",
  "convex/feedback/tierNotices.ts table:members",
  "convex/feedback/tierNotices.ts table:unlockLaunches",
  "convex/feedback/welcome.ts table:welcomes",
  "convex/feedback/welcomeNudge.ts table:users",
  "convex/groups/groups.ts table:userGroups",
  "convex/groups/reconcile.ts table:members",
  "convex/album/hoggies/boughtCrates.ts spend",
  "convex/album/hoggies/drops.ts applyGain",
  "convex/album/items/fill.ts table:members",
  "convex/leaderboard/newGivers.ts table:thoughtfulBoardTallies",
  "convex/mondayDm/mondayDm.ts table:questStarts",
  "convex/progression/perks.ts coinsShownTo",
  "convex/progression/perks.ts spend",
  "convex/progression/progression.ts credit",
  "convex/quests/journey.ts table:members",
  "convex/quests/newWeek.ts table:members",
  "convex/slack/appHome.ts xpLevelsShownTo",
  "convex/store/buying.ts spend",
  "convex/store/visibility.ts coinsShownTo",
  "convex/unlocks/launch.ts table:members",
  "convex/unlocks/launch.ts xpLevelsShownTo",
  "convex/unlocks/sweep.ts table:memberProgress",
  "convex/unlocks/sweep.ts table:members",
  "convex/unlocks/unlocks.ts dropFor",
  "convex/website/album.ts forge",
  "convex/website/album.ts makePetOf",
  "convex/website/album.ts turn",
  "convex/website/commands.ts dropOf",
  "convex/website/commands.ts openedCrateDropOf",
  "convex/website/linkPreviews.ts table:companyTeams",
];

describe("HH16: writes cross modules as bus facts", () => {
  test("every table has one owning module", () => {
    const mapped = Object.values(tablesOf).flat();

    expect(mapped.toSorted(), "the tables of the owner map").toEqual(Object.keys(schema.tables).toSorted());
    expect(new Set(mapped).size, "tables owned twice").toBe(mapped.length);
  });

  test("the crossings of a write function of a module that writes rewards, or of a table, are exactly the allowlist, so it only shrinks", () => {
    expect(everyCrossing().toSorted(), "+ crossings not on the allowlist, - allowlisted crossings that no longer occur").toEqual(allowed.toSorted());
  });

  test.each([
    ["a named import", `import { earnItem } from "../album/items/ledger";`, ["convex/stickers/stickers.ts earnItem"]],
    ["a renamed import over lines", `import {\n  type Earning,\n  earnItem as earn,\n} from '../album/items/ledger';`, ["convex/stickers/stickers.ts earnItem"]],
    ["a namespace import of another module, whatever it uses", `import * as ledger from "../album/items/ledger.ts";\nconst { earnItem } = ledger;`, ["convex/stickers/stickers.ts namespace:convex/album/items/ledger"]],
    ["a named import with its extension", `import { earnItem } from "../album/items/ledger.ts";`, ["convex/stickers/stickers.ts earnItem"]],
    ["a re-export", `export { earnItem } from "../album/items/ledger";`, ["convex/stickers/stickers.ts earnItem"]],
    ["a query in single quotes", `await ctx.db.query('items').collect();`, ["convex/stickers/stickers.ts table:items"]],
    ["a query spaced from its table", `await ctx.db.query ( "items" ).collect();`, ["convex/stickers/stickers.ts table:items"]],
    ["a star re-export of another module", `export * from "../album/items/ledger";`, ["convex/stickers/stickers.ts namespace:convex/album/items/ledger"]],
    ["a named star re-export of another module", `export * as ledger from "../album/items/ledger";`, ["convex/stickers/stickers.ts namespace:convex/album/items/ledger"]],
    ["a namespace import beside a default import", `import ledger, * as all from "../album/items/ledger";`, ["convex/stickers/stickers.ts namespace:convex/album/items/ledger"]],
    ["a wrapper of a write in a module that writes rewards", `import { earnTeamItem } from "../album/items/achievements";`, ["convex/stickers/stickers.ts earnTeamItem"]],
    ["a read of a module that writes rewards", `import { standingOf } from "../progression/progression";`, []],
    ["a write of a module that doesn't write rewards", `import { finishMondayQuest } from "../quests/finish";`, []],
    ["a query with a type argument", `await ctx.db.query<"items">("items").collect();`, ["convex/stickers/stickers.ts table:items"]],
    ["a query whose table the guard can't read", `await ctx.db.query(tableName).collect();`, ["convex/stickers/stickers.ts query:tableName"]],
    ["a type-only import", `import type { earnItem } from "../album/items/ledger";`, []],
    ["a dynamic import of another module", `const ledger = await import("../album/items/ledger");`, ["convex/stickers/stickers.ts namespace:convex/album/items/ledger"]],
    ["a dynamic import the guard can't read", `const ledger = await import(where);`, ["convex/stickers/stickers.ts namespace:unknown"]],
    ["a query by element access", `await ctx.db["query"]("items").collect();`, ["convex/stickers/stickers.ts table:items"]],
    ["a database method the guard can't name", `await ctx.db[method]("items").collect();`, ["convex/stickers/stickers.ts table:items"]],
    ["a call through a lookup table", `await fillers[step.kind](ctx, step);`, []],
    ["the module's own write and table", `import { insertSticker } from "./records";\nawait ctx.db.query("stickers").collect();`, []],
  ])("finds %s", (_, source, crossings) => {
    expect(crossingsOf("/convex/stickers/stickers.ts", source)).toEqual(crossings);
  });

  test.each([
    ["an exported function", `export async function earnBonus(ctx: MutationCtx, member: MemberId) {}`, ["earnBonus"]],
    ["an exported function with a type parameter", `export function earnAll<T extends Item>(ctx: MutationCtx, items: T[]) {}`, ["earnAll"]],
    ["an exported function whose context is destructured", `export function earnBonus({ db }: MutationCtx) {}`, ["earnBonus"]],
    ["an exported arrow", `export const earnBonus = async (ctx: MutationCtx) => {};`, ["earnBonus"]],
    ["an exported wrapped arrow", `export const earnBonus = withBudget(async (ctx: MutationCtx) => {});`, ["earnBonus"]],
    ["a function exported in a list", `async function earnBonus(ctx: MutationCtx) {}\nexport { earnBonus };`, ["earnBonus"]],
    ["a function exported under another name", `async function earn(ctx: MutationCtx) {}\nexport { earn as earnBonus };`, ["earnBonus"]],
    ["a re-export from a file the guard can't find", `export { earn as earnBonus } from "./missing";`, ["earnBonus"]],
    ["a destructured export it can't read", `export const { earnBonus, levels: levelOf = level } = writers;`, ["earnBonus", "levelOf"]],
    ["a read", `export async function standingOf(ctx: QueryCtx, member: MemberId) {}`, []],
    ["a read that also takes a mutation's context", `export function xpLevelsShownIn(ctx: QueryCtx | MutationCtx, workspace: string) {}`, []],
    ["a constant", `export const hugXp = 1;\nfunction earn(ctx: MutationCtx) {}`, []],
    ["a constant that may be missing", `export const noReward: null | undefined = null;\nexport function skip(ctx: undefined | void) {}`, []],
    ["a read exported in a list", `function standingOf(ctx: QueryCtx) {}\nexport { standingOf, type Standing };`, []],
    ["a type-only list", `export type { Earning } from "./ledger";`, []],
    ["a re-export of an imported write under another name", `import { earnItem } from "./ledger";\nexport { earnItem as earnBonus };`, ["earnBonus"]],
    ["a constant bound to an imported write", `import { earnItem } from "./ledger";\nexport const earnBonus = earnItem;`, ["earnBonus"]],
    ["a re-export of a write from another file", `export { earnItem as earnBonus } from "./ledger";`, ["earnBonus"]],
    ["a re-export of a read from another place", `export { standingOf as standing } from "../../progression/progression";`, []],
    ["the second binding of an exported statement", `export const rewardKind = "bonus", earnBonus = async (ctx: MutationCtx) => {};`, ["earnBonus"]],
    ["a write that takes a reading callback", `export async function earnBonus(ctx: MutationCtx, read: (ctx: QueryCtx) => Promise<void>) {}`, ["earnBonus"]],
    ["a write whose context is a type parameter", `export function earnFor<Ctx extends MutationCtx>(ctx: Ctx) {}`, ["earnFor"]],
    ["a default export", `export default async function (ctx: MutationCtx) {}`, ["default"]],
    ["a method of an exported object", `export const ledger = { async earn(ctx: MutationCtx) {} };`, ["ledger"]],
    ["a property of a local write", `const ledger = { earn: async (ctx: MutationCtx) => {} };\nexport const earnBonus = ledger.earn;`, ["earnBonus"]],
    ["an arrow whose callable type takes a mutation's context", `export const earnBonus: (ctx: MutationCtx) => Promise<void> = async (ctx) => {};`, ["earnBonus"]],
    ["a write whose context is an imported alias", `import type { MutationCtx as WriteCtx } from "../../_generated/server";\nexport function earnBonus(ctx: WriteCtx) {}`, ["earnBonus"]],
    ["a write whose context is a local alias", `type WriteCtx = MutationCtx;\ninterface LedgerCtx extends WriteCtx {}\nexport function earnBonus(ctx: LedgerCtx) {}`, ["earnBonus"]],
    ["a read whose context is an alias", `type ReadCtx = QueryCtx;\nexport function standingOf(ctx: ReadCtx) {}`, []],
    ["a write whose context may be missing", `export function earnBonus(ctx: MutationCtx | undefined) {}\nexport function earnLater(ctx: MutationCtx | null) {}`, ["earnBonus", "earnLater"]],
  ])("reads %s of a module that writes rewards", (_, source, writes) => {
    expect(writeFunctionsIn("/convex/album/items/bonus.ts", source)).toEqual(writes);
  });

  test("finds a write imported through a file of another module that re-exports it", () => {
    const files = { ...sources, "/convex/album/rewardSeam.ts": `export { earnItem as earn } from "./items/ledger";` };

    expect(crossingsOf("/convex/stickers/stickers.ts", `import { earn } from "../album/rewardSeam";`, files)).toEqual(["convex/stickers/stickers.ts earn"]);
  });

  test.each([
    ["an alias another file exports", { contexts: `export type WriteCtx = GenericMutationCtx<DataModel>;`, bonus: `import type { WriteCtx } from "./contexts";\nexport function earnBonus(ctx: WriteCtx) {}` }],
    ["an alias repeated across a union", { bonus: `type WriteCtx = MutationCtx;\ntype OtherWriteCtx = WriteCtx;\nexport function earnBonus(ctx: WriteCtx | OtherWriteCtx) {}` }],
    ["an alias another file exports in a list", { contexts: `import type { MutationCtx as LocalCtx } from "../../_generated/server";\nexport type { LocalCtx as WriteCtx };`, bonus: `import type { WriteCtx } from "./contexts";\nexport function earnBonus(ctx: WriteCtx) {}` }],
    ["an alias a barrel passes on with a star", { contexts: `export type WriteCtx = MutationCtx;`, barrel: `export * from "./contexts";`, bonus: `import type { WriteCtx } from "./barrel";\nexport function earnBonus(ctx: WriteCtx) {}` }],
    ["an alias read through a namespace import", { contexts: `export type WriteCtx = MutationCtx;`, bonus: `import type * as contexts from "./contexts";\nexport function earnBonus(ctx: contexts.WriteCtx) {}` }],
  ])("finds a write whose context is %s", (_, written: Record<string, string>) => {
    const files = Object.fromEntries(Object.entries(written).map(([name, source]) => [`/convex/album/items/${name}.ts`, source]));

    expect(crossingsOf("/convex/stickers/stickers.ts", `import { earnBonus } from "../album/items/bonus";`, files)).toEqual(["convex/stickers/stickers.ts earnBonus"]);
  });

  test("reads a write of files that re-export each other as a write from either file", () => {
    const files = {
      "/convex/album/items/first.ts": `export * from "./second";\nexport async function earnCycle(ctx: MutationCtx) {}`,
      "/convex/album/items/second.ts": `export * from "./first";`,
    };

    expect(writesOfFile(files, "/convex/album/items/first.ts"), "the first file").toContain("earnCycle");
    expect(writesOfFile(files, "/convex/album/items/second.ts"), "the second file").toSatisfy((writes: string[]) => isAWriteOf(writes, "earnCycle"));
  });
});

function everyCrossing() {
  return [...new Set(Object.entries(sources).flatMap(([path, source]) => crossingsOf(path, source)))];
}

function crossingsOf(path: string, source: string, files: Files = sources) {
  const file = syntaxOf(path, source);
  return [...writesImportedBy(path, file, files), ...wholeModulesReachedBy(path, file), ...tablesQueriedBy(path, file)];
}

function syntaxOf(path: string, source: string) {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function writesImportedBy(path: string, file: ts.SourceFile, files: Files) {
  return namedImportsOf(file)
    .filter(({ from }) => isAnotherModule(path, from))
    .flatMap(({ names, from }) => names.filter((name) => isAWriteOf(writeFunctionsOf(files, resolved(path, from)), name)))
    .map((name) => `${fileOf(path)} ${name}`);
}

function namedImportsOf(file: ts.SourceFile) {
  return file.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement)) return [{ names: importedNamesOf(statement.importClause), from: specifierOf(statement) }];
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined && !statement.isTypeOnly && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      return [{ names: valueElementsOf(statement.exportClause).map((element) => (element.propertyName ?? element.name).text), from: specifierOf(statement) }];
    }
    return [];
  });
}

function importedNamesOf(clause: ts.ImportClause | undefined) {
  if (clause === undefined || clause.isTypeOnly) return [];
  const named = clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) ? valueElementsOf(clause.namedBindings).map((element) => (element.propertyName ?? element.name).text) : [];
  return clause.name === undefined ? named : ["default", ...named];
}

function valueElementsOf(list: ts.NamedImports | ts.NamedExports) {
  return (list.elements as ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>).filter((element) => !element.isTypeOnly);
}

function specifierOf(statement: ts.ImportDeclaration | ts.ExportDeclaration) {
  return statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "";
}

function wholeModulesReachedBy(path: string, file: ts.SourceFile) {
  const reached = [...namespacesOf(file), ...dynamicImportsOf(file)];
  return reached.filter((from) => from === null || isAnotherModule(path, from)).map((from) => `${fileOf(path)} namespace:${from === null ? "unknown" : fileOf(resolved(path, from))}`);
}

function namespacesOf(file: ts.SourceFile) {
  return file.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly !== true && statement.importClause?.namedBindings !== undefined && ts.isNamespaceImport(statement.importClause.namedBindings)) return [specifierOf(statement)];
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier !== undefined && (statement.exportClause === undefined || ts.isNamespaceExport(statement.exportClause))) return [specifierOf(statement)];
    return [];
  });
}

function dynamicImportsOf(file: ts.SourceFile) {
  return descendantsOf(file)
    .filter((node): node is ts.CallExpression => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
    .map(({ arguments: [argument] }) => (argument !== undefined && ts.isStringLiteralLike(argument) ? argument.text : null));
}

function tablesQueriedBy(path: string, file: ts.SourceFile) {
  return descendantsOf(file)
    .filter((node): node is ts.CallExpression => ts.isCallExpression(node) && isTheQueryMethod(node.expression))
    .flatMap(({ arguments: [argument] }) => {
      if (argument === undefined || !ts.isStringLiteralLike(argument)) return [`${fileOf(path)} query:${argument?.getText() ?? ""}`];
      const owner = ownerOf(argument.text);
      return owner !== undefined && owner !== moduleOf(path) ? [`${fileOf(path)} table:${argument.text}`] : [];
    });
}

function isTheQueryMethod(callee: ts.Expression) {
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text === "query";
  if (!ts.isElementAccessExpression(callee)) return false;
  const key = callee.argumentExpression;
  return ts.isStringLiteralLike(key) ? key.text === "query" : isTheDatabase(callee.expression);
}

function isTheDatabase(node: ts.Expression) {
  return (ts.isPropertyAccessExpression(node) && node.name.text === "db") || (ts.isIdentifier(node) && node.text === "db");
}

function descendantsOf(node: ts.Node): ts.Node[] {
  return node.getChildren().flatMap((child) => [child, ...descendantsOf(child)]);
}

const everyName = "*";

function isAWriteOf(writes: string[], name: string) {
  return writes.includes(name) || writes.includes(everyName);
}

function writeFunctionsOf(files: Files, target: string) {
  const path = sourcePathOf(files, target);
  if (path !== undefined) return writesOfFile(files, path);
  return placeThatWritesRewardsOf(target) === undefined ? [] : [everyName];
}

function placeThatWritesRewardsOf(path: string) {
  return placesThatWriteRewards.find((place) => path.startsWith(`/convex/${place}/`));
}

type Files = Record<string, string>;

function sourcePathOf(files: Files, target: string) {
  return [`${target}.ts`, `${target}/index.ts`].find((path) => path in files);
}

const writesByFiles = new WeakMap<Files, Map<string, string[]>>();

function writesOfFile(files: Files, path: string): string[] {
  const writesByFile = writesByFiles.get(files) ?? writesByFiles.set(files, new Map()).get(files)!;
  const known = writesByFile.get(path);
  if (known !== undefined) return known;
  writesByFile.set(path, [everyName]);
  const writes = writeFunctionsIn(path, files[path] ?? "", files);
  writesByFile.set(path, writes);
  return writes;
}

function writeFunctionsIn(path: string, source: string, files: Files = sources) {
  const parsed = { path, file: syntaxOf(path, source), files };
  return [...new Set(parsed.file.statements.flatMap((statement) => writesExportedBy(parsed, statement)))];
}

const syntaxByFiles = new WeakMap<Files, Map<string, ts.SourceFile>>();

function parsedFileOf(files: Files, path: string): ParsedFile {
  const syntaxByPath = syntaxByFiles.get(files) ?? syntaxByFiles.set(files, new Map()).get(files)!;
  const file = syntaxByPath.get(path) ?? syntaxByPath.set(path, syntaxOf(path, files[path] ?? "")).get(path)!;
  return { path, file, files };
}

type ParsedFile = { path: string; file: ts.SourceFile; files: Files };

function writesExportedBy(parsed: ParsedFile, statement: ts.Statement): string[] {
  if (ts.isExportDeclaration(statement)) return statement.isTypeOnly ? [] : writesListedBy(parsed, statement);
  if (ts.isExportAssignment(statement)) return expressionWrites(parsed, statement.expression, new Set()) ? ["default"] : [];
  if (!isExported(statement)) return [];
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap((declaration) => writesBoundBy(parsed, declaration));
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) return declarationWrites(parsed, statement, new Set()) ? [exportedNameOf(statement)] : [];
  return [];
}

function isExported(statement: ts.Statement) {
  return ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
}

function exportedNameOf(statement: ts.FunctionDeclaration | ts.ClassDeclaration) {
  const isDefault = (ts.getModifiers(statement) ?? []).some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword);
  return isDefault ? "default" : (statement.name?.text ?? "default");
}

function writesBoundBy(parsed: ParsedFile, declaration: ts.VariableDeclaration) {
  if (!ts.isIdentifier(declaration.name)) return namesBoundBy(declaration.name);
  return declarationWrites(parsed, declaration, new Set()) ? [declaration.name.text] : [];
}

function namesBoundBy(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : namesBoundBy(element.name)));
}

function writesListedBy(parsed: ParsedFile, statement: ts.ExportDeclaration) {
  const from = statement.moduleSpecifier === undefined ? null : specifierOf(statement);
  if (statement.exportClause === undefined) return from === null ? [] : writesOfModule(parsed, from);
  if (ts.isNamespaceExport(statement.exportClause)) return from !== null && writesOfModule(parsed, from).length > 0 ? [statement.exportClause.name.text] : [];
  return valueElementsOf(statement.exportClause)
    .filter((element) => {
      const local = (element.propertyName ?? element.name).text;
      return from === null ? localWrites(parsed, local, new Set()) : importedWrites(parsed, from, local);
    })
    .map((element) => element.name.text);
}

function writesOfModule({ path, files }: ParsedFile, from: string) {
  return from.startsWith(".") ? writeFunctionsOf(files, resolved(path, from)) : [];
}

function importedWrites(parsed: ParsedFile, from: string, name: string) {
  return isAWriteOf(writesOfModule(parsed, from), name);
}

function localWrites(parsed: ParsedFile, name: string, seen: Set<string>): boolean {
  if (seen.has(name)) return false;
  seen.add(name);
  return parsed.file.statements.some((statement) => statementBindsAWrite(parsed, statement, name, seen));
}

function statementBindsAWrite(parsed: ParsedFile, statement: ts.Statement, name: string, seen: Set<string>) {
  if (ts.isImportDeclaration(statement)) return importBindsAWrite(parsed, statement, name);
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some((declaration) => namesBoundBy(declaration.name).includes(name) && (!ts.isIdentifier(declaration.name) || declarationWrites(parsed, declaration, seen)));
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) return statement.name?.text === name && declarationWrites(parsed, statement, seen);
  return false;
}

function importBindsAWrite(parsed: ParsedFile, statement: ts.ImportDeclaration, name: string) {
  const clause = statement.importClause;
  if (clause === undefined || clause.isTypeOnly) return false;
  const from = specifierOf(statement);
  if (clause.name?.text === name) return importedWrites(parsed, from, "default");
  const bindings = clause.namedBindings;
  if (bindings === undefined) return false;
  if (ts.isNamespaceImport(bindings)) return bindings.name.text === name && writesOfModule(parsed, from).length > 0;
  const element = valueElementsOf(bindings).find((candidate) => candidate.name.text === name);
  return element !== undefined && importedWrites(parsed, from, (element.propertyName ?? element.name).text);
}

function declarationWrites(parsed: ParsedFile, declaration: ts.VariableDeclaration | ts.FunctionDeclaration | ts.ClassDeclaration, seen: Set<string>) {
  if (ts.isVariableDeclaration(declaration)) return (declaration.type !== undefined && annotationDefinesAWrite(parsed, declaration.type)) || (declaration.initializer !== undefined && expressionWrites(parsed, declaration.initializer, seen));
  return expressionWrites(parsed, declaration, seen);
}

function expressionWrites(parsed: ParsedFile, node: ts.Node, seen: Set<string>): boolean {
  if (ts.isFunctionLike(node)) return definesAWrite(parsed, node);
  if (ts.isTypeNode(node)) return false;
  if (ts.isIdentifier(node)) return localWrites(parsed, node.text, seen);
  if (ts.isPropertyAccessExpression(node)) return expressionWrites(parsed, node.expression, seen);
  if (ts.isPropertyAssignment(node)) return expressionWrites(parsed, node.initializer, seen);
  if (ts.isShorthandPropertyAssignment(node)) return localWrites(parsed, node.name.text, seen);
  return node.getChildren().some((child) => expressionWrites(parsed, child, seen));
}

function annotationDefinesAWrite(parsed: ParsedFile, type: ts.TypeNode) {
  return ts.isFunctionTypeNode(type) ? definesAWrite(parsed, type) : isInAPlaceThatWritesRewards(parsed) && typeNeedsAMutationCtx(parsed, type, [], new Set());
}

function definesAWrite(parsed: ParsedFile, fn: ts.SignatureDeclaration) {
  return isInAPlaceThatWritesRewards(parsed) && fn.parameters.some(({ type }) => type !== undefined && typeNeedsAMutationCtx(parsed, type, fn.typeParameters ?? [], new Set()));
}

function isInAPlaceThatWritesRewards({ path }: ParsedFile) {
  return placeThatWritesRewardsOf(path) !== undefined;
}

function typeNeedsAMutationCtx(parsed: ParsedFile, type: ts.TypeNode, typeParameters: readonly ts.TypeParameterDeclaration[], active: Set<string>): boolean {
  const needs = (inner: ts.TypeNode) => typeNeedsAMutationCtx(parsed, inner, typeParameters, active);
  if (ts.isParenthesizedTypeNode(type)) return needs(type.type);
  if (ts.isUnionTypeNode(type)) return unionNeedsAMutationCtx(type, needs);
  if (ts.isIntersectionTypeNode(type)) return type.types.some(needs);
  if (ts.isIndexedAccessTypeNode(type)) return needs(type.objectType);
  if (ts.isTypeLiteralNode(type)) return type.members.some((member) => ts.isPropertySignature(member) && member.type !== undefined && needs(member.type));
  if (!ts.isTypeReferenceNode(type)) return false;
  if (ts.isQualifiedName(type.typeName)) return qualifiedNameMeansAMutationCtx(parsed, type.typeName, active) || (type.typeArguments ?? []).some(needs);
  const name = type.typeName.text;
  const constraint = typeParameters.find((parameter) => parameter.name.text === name)?.constraint;
  if (constraint !== undefined) return needs(constraint);
  return typeNameMeansAMutationCtx(parsed, name, active) || (type.typeArguments ?? []).some(needs);
}

function unionNeedsAMutationCtx(union: ts.UnionTypeNode, needs: (member: ts.TypeNode) => boolean) {
  const somethings = union.types.filter((member) => !isNothing(member));
  return somethings.length > 0 && somethings.every(needs);
}

const contextNamesByFiles = new WeakMap<Files, Map<string, boolean>>();

function typeNameMeansAMutationCtx(parsed: ParsedFile, name: string, active: Set<string>): boolean {
  if (name.endsWith("MutationCtx")) return true;
  const known = contextNamesByFiles.get(parsed.files) ?? contextNamesByFiles.set(parsed.files, new Map()).get(parsed.files)!;
  const key = `${parsed.path} ${name}`;
  const answer = known.get(key);
  if (answer !== undefined) return answer;
  if (active.has(key)) return false;
  active.add(key);
  const means = parsed.file.statements.some((statement) => statementNamesAMutationCtx(parsed, statement, name, active));
  active.delete(key);
  known.set(key, means);
  return means;
}

function qualifiedNameMeansAMutationCtx(parsed: ParsedFile, { left, right }: ts.QualifiedName, active: Set<string>) {
  if (right.text.endsWith("MutationCtx")) return true;
  const target = ts.isIdentifier(left) ? namespaceTargetOf(parsed, left.text) : undefined;
  return target !== undefined && typeNameMeansAMutationCtx(parsedFileOf(parsed.files, target), right.text, active);
}

function namespaceTargetOf(parsed: ParsedFile, name: string) {
  const statement = parsed.file.statements.find(
    (candidate): candidate is ts.ImportDeclaration =>
      ts.isImportDeclaration(candidate) && candidate.importClause?.namedBindings !== undefined && ts.isNamespaceImport(candidate.importClause.namedBindings) && candidate.importClause.namedBindings.name.text === name,
  );
  return statement === undefined ? undefined : relativeTargetOf(parsed, specifierOf(statement));
}

function relativeTargetOf(parsed: ParsedFile, from: string) {
  return from.startsWith(".") ? sourcePathOf(parsed.files, resolved(parsed.path, from)) : undefined;
}

function statementNamesAMutationCtx(parsed: ParsedFile, statement: ts.Statement, name: string, active: Set<string>) {
  if (ts.isTypeAliasDeclaration(statement)) return statement.name.text === name && typeNeedsAMutationCtx(parsed, statement.type, statement.typeParameters ?? [], active);
  if (ts.isInterfaceDeclaration(statement)) return statement.name.text === name && (statement.heritageClauses ?? []).some(({ types }) => types.some(({ expression }) => typeNameMeansAMutationCtx(parsed, lastNameOf(expression), active)));
  if (ts.isExportDeclaration(statement) && statement.exportClause === undefined) return starExportNamesAMutationCtx(parsed, statement, name, active);
  if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) return bindingNamesAMutationCtx(parsed, statement, name, active);
  return false;
}

function starExportNamesAMutationCtx(parsed: ParsedFile, statement: ts.ExportDeclaration, name: string, active: Set<string>) {
  const target = relativeTargetOf(parsed, specifierOf(statement));
  return target !== undefined && typeNameMeansAMutationCtx(parsedFileOf(parsed.files, target), name, active);
}

function lastNameOf(expression: ts.Expression) {
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : expression.getText();
}

function bindingNamesAMutationCtx(parsed: ParsedFile, statement: ts.ImportDeclaration | ts.ExportDeclaration, name: string, active: Set<string>) {
  const element = namedElementsOf(statement).find((candidate) => candidate.name.text === name);
  if (element === undefined) return false;
  const original = (element.propertyName ?? element.name).text;
  if (ts.isExportDeclaration(statement) && statement.moduleSpecifier === undefined) return original !== name && typeNameMeansAMutationCtx(parsed, original, active);
  const target = relativeTargetOf(parsed, specifierOf(statement));
  return target === undefined ? original.endsWith("MutationCtx") : typeNameMeansAMutationCtx(parsedFileOf(parsed.files, target), original, active);
}

function namedElementsOf(statement: ts.ImportDeclaration | ts.ExportDeclaration): readonly (ts.ImportSpecifier | ts.ExportSpecifier)[] {
  if (ts.isImportDeclaration(statement)) {
    const bindings = statement.importClause?.namedBindings;
    return bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : [];
  }
  return statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause) ? statement.exportClause.elements : [];
}

function isNothing(type: ts.TypeNode) {
  return type.kind === ts.SyntaxKind.UndefinedKeyword || type.kind === ts.SyntaxKind.VoidKeyword || (ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword);
}

function isAnotherModule(path: string, from: string) {
  return from.startsWith(".") && moduleOf(resolved(path, from)) !== moduleOf(path);
}

function ownerOf(table: string) {
  return Object.entries(tablesOf).find(([, tables]) => tables.includes(table))?.[0];
}

function resolved(path: string, from: string) {
  const parts = path.split("/").slice(0, -1);
  for (const part of from.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/").replace(/\.ts$/, "");
}

function moduleOf(path: string) {
  const [, , module = "", ...rest] = path.split("/");
  return rest.length === 0 ? "" : module;
}

function fileOf(path: string) {
  return path.slice(1);
}
