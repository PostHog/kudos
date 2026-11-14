// The emoji name registry: every earned emoji's one name in a workspace, reserved the first time it is needed and never
// moved but by a mapping, a second name an operator gives, and the numbering of namesakes. Today's
// convex/album/emojiNames.ts over the service's transaction; the bus's companyTeamsReplaced subscriber and the two
// operator mutations are jobs under their Convex names.
import { and, eq, gte, isNull, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { companyTeamsReplacedEventValidator } from "../bus/events.ts";
import { companyTeamsOf } from "../companyProfiles/teams.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { emojiNameNumbers, emojiNames, secondEmojiNames, type Doc } from "../db/schema/index.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { fullNameOf, type MemberId } from "../workspace/directory.ts";
import { slackEmojiImageOf } from "../workspace/slackEmoji.ts";
import { isStandardEmojiName } from "../workspace/standardEmoji.ts";
import { emojiLevels, levelTwoEmoji, milestoneTierEmojiOf, milestoneTierEmojis, slugOf } from "./emojiCatalogue.ts";
import { isClassed } from "./emojiClasses.ts";
import type { EmojiMapper, MilestoneId, MilestoneTier } from "./records.ts";
import { allIn, deleteIn, insertInto, patchIn, uniqueIn } from "./rows.ts";

export type EarnedEmojiId = `level:${number}` | `milestone:${MilestoneId}:${MilestoneTier}` | `team:${string}` | `hype:${MemberId}`;

const hypeSuffix = "-hype";
const teamStem = "team";
const firstUse: EarnedEmojiId = `level:${emojiLevels[0]}`;

const byWorkspaceEmoji = indexOrder(emojiNames, ["workspace", "emoji", "person"]);
const byWorkspaceName = indexOrder(emojiNames, ["workspace", "name"]);
const byEmoji = indexOrder(emojiNames, ["emoji", "person", "workspace"]);
const secondByWorkspaceName = indexOrder(secondEmojiNames, ["workspace", "name"]);
const numbersByWorkspaceStem = indexOrder(emojiNameNumbers, ["workspace", "stem"]);

export async function emojiNameOf(ctx: QueryContext, workspace: string, emoji: EarnedEmojiId): Promise<string | null> {
  return (await registeredAs(ctx, workspace, emoji))?.name ?? null;
}

export async function nameHypeEmojiOf(ctx: MutationContext, workspace: string, person: MemberId): Promise<void> {
  if ((await registeredAs(ctx, workspace, `hype:${person}`)) !== null) return;
  await reserveSharedNamesIn(ctx, workspace);
  await reserveTeamNamesShapedLikeHypes(ctx, workspace);
  await allocate(ctx, workspace, `hype:${person}`, hypeNameShapeOf(await fullNameOf(ctx, person)));
}

export function firstHypeEmojiNameFor(fullName: string): string {
  return firstCandidateOf(hypeNameShapeOf(fullName));
}

export function hypeNameHintsIn(ctx: QueryContext, workspace: string): (fullName: string) => Promise<string> {
  const hinted = new Set<string>();
  const lastHintedNumbers = new Map<string, number>();
  return async (fullName) => {
    const shape = hypeNameShapeOf(fullName);
    const { name, number } = await nextFreeName(ctx, workspace, shape, async (candidate) => hinted.has(candidate), lastHintedNumbers.get(numberedStemOf(shape)));
    hinted.add(name);
    if (number !== undefined) lastHintedNumbers.set(numberedStemOf(shape), number);
    return name;
  };
}

function hypeNameShapeOf(fullName: string): NameShape {
  return { slug: slugOf(fullName), empty: "person", suffix: hypeSuffix };
}

export async function teamEmojiNameOf(ctx: MutationContext, workspace: string, team: string): Promise<string> {
  if ((await emojiNameOf(ctx, workspace, `team:${team}`)) === null) await openTheRegistryOrNameItsTeamsIn(ctx, workspace);
  const name = await emojiNameOf(ctx, workspace, `team:${team}`);
  if (name === null) throw new Error(`the company copy holds no team ${team} to name`);
  return name;
}

async function openTheRegistryOrNameItsTeamsIn(ctx: MutationContext, workspace: string) {
  if ((await registeredAs(ctx, workspace, firstUse)) === null) await reserveSharedNamesIn(ctx, workspace);
  else await reserveCompanyTeamNamesIn(ctx, workspace);
}

export async function namesHeldIn(ctx: QueryContext, workspace: string): Promise<Map<string, EarnedEmojiId>> {
  const rows = await namedRowsIn(ctx, workspace);
  return new Map([...(await secondNamesIn(ctx, workspace)), ...rows.map((row): [string, EarnedEmojiId] => [row.name, emojiIdOf(row)])]);
}

async function secondNamesIn(ctx: QueryContext, workspace: string): Promise<[string, EarnedEmojiId][]> {
  const rows = await allIn<Doc<"secondEmojiNames">>(ctx, secondEmojiNames, secondByWorkspaceName, eq(secondEmojiNames.workspace, workspace));
  return rows.map(({ name, emoji }) => [name, emoji as EarnedEmojiId]);
}

export const giveEmojiASecondNameArgs = z.strictObject({ workspace: z.string(), emoji: z.string(), name: z.string() });
export async function giveEmojiASecondName(ctx: MutationContext, { workspace, emoji, name }: z.infer<typeof giveEmojiASecondNameArgs>): Promise<boolean> {
  if ((await registeredAs(ctx, workspace, emoji as EarnedEmojiId)) === null || (await isTakenOrClassed(ctx, workspace, name))) return false;
  await insertInto(ctx, secondEmojiNames, { workspace, emoji, name });
  return true;
}
export const giveEmojiASecondNameJob = mutationJob("album.emojiNames.giveEmojiASecondName", giveEmojiASecondNameArgs, giveEmojiASecondName);

export async function openTheRegistryIn(ctx: MutationContext, workspace: string): Promise<void> {
  await reserveSharedNamesIn(ctx, workspace);
}

export async function giveEmojiTheName(ctx: MutationContext, workspace: string, emoji: EarnedEmojiId, name: string, mappedBy: EmojiMapper): Promise<void> {
  const named = await registeredAs(ctx, workspace, emoji);
  if (named?.name === name) {
    if (named.mappedBy?.as !== mappedBy.as) await patchIn(ctx, emojiNames, named, { mappedBy });
    return;
  }
  await freeTheName(ctx, workspace, name);
  if (named === null) await insertInto(ctx, emojiNames, { workspace, ...storedKeyOf(emoji), name, mappedBy });
  else await patchIn(ctx, emojiNames, named, { name, mappedBy });
}

export async function freeTheName(ctx: MutationContext, workspace: string, name: string): Promise<void> {
  const secondHolder = await secondHolderOf(ctx, workspace, name);
  if (secondHolder !== null) await deleteIn(ctx, secondEmojiNames, secondHolder);
  const holder = await holderOf(ctx, workspace, name);
  if (holder === null) return;
  const shape = await naturalShapeOf(ctx, emojiIdOf(holder));
  await patchIn(ctx, emojiNames, holder, { name: await firstFreeName(ctx, workspace, shape, (candidate) => slackHas(ctx, workspace, candidate)), mappedBy: undefined });
}

export type RegisteredEmoji = { emoji: EarnedEmojiId; name: string; mappedBy: EmojiMapper | null };

export async function registeredEmojisIn(ctx: QueryContext, workspace: string): Promise<RegisteredEmoji[]> {
  const rows = await namedRowsIn(ctx, workspace);
  return rows.map((row) => ({ emoji: emojiIdOf(row), name: row.name, mappedBy: row.mappedBy ?? null }));
}

export async function emojiNamed(ctx: QueryContext, workspace: string, name: string): Promise<EarnedEmojiId | null> {
  const holder = await holderOf(ctx, workspace, name);
  if (holder !== null) return emojiIdOf(holder);
  return ((await secondHolderOf(ctx, workspace, name))?.emoji as EarnedEmojiId | undefined) ?? null;
}

export async function mapperOf(ctx: QueryContext, workspace: string, emoji: EarnedEmojiId): Promise<EmojiMapper | null> {
  return (await registeredAs(ctx, workspace, emoji))?.mappedBy ?? null;
}

async function slackHas(ctx: QueryContext, workspace: string, name: string) {
  return (await slackEmojiImageOf(ctx, workspace, name)) !== undefined;
}

async function naturalShapeOf(ctx: QueryContext, emoji: EarnedEmojiId): Promise<NameShape> {
  const [kind, cause] = splitOnce(emoji);
  if (kind === "level") return levelNameShapeOf(cause);
  if (kind === "milestone") return { slug: slugOf(milestoneTierEmojiOf(cause)?.name ?? cause), empty: "milestone", suffix: "" };
  if (kind === "team") return teamNameShapeOf((await companyTeamsOf(ctx)).find(({ team }) => team === cause)?.name ?? cause);
  return hypeNameShapeOf(await fullNameOf(ctx, cause as MemberId));
}

function splitOnce(id: string): [string, string] {
  const colon = id.indexOf(":");
  return [id.slice(0, colon), id.slice(colon + 1)];
}

export const reserveTeamNamesAfterTheSyncArgs = z.strictObject({ event: companyTeamsReplacedEventValidator });
export async function reserveTeamNamesAfterTheSync(ctx: MutationContext, args: z.infer<typeof reserveTeamNamesAfterTheSyncArgs>): Promise<null> {
  for (const workspace of await workspacesWithARegistry(ctx)) {
    await moveBareTeamNamesToTheTeamPrefixIn(ctx, workspace);
    await reserveCatalogueNamesIn(ctx, workspace);
    await reserveCompanyTeamNamesIn(ctx, workspace);
  }
  return null;
}
export const reserveTeamNamesAfterTheSyncJob = mutationJob("album.emojiNames.reserveTeamNamesAfterTheSync", reserveTeamNamesAfterTheSyncArgs, reserveTeamNamesAfterTheSync);

export const reserveSharedEmojiNamesArgs = z.strictObject({ workspace: z.optional(z.string()) });
export async function reserveSharedEmojiNames(ctx: MutationContext, { workspace }: z.infer<typeof reserveSharedEmojiNamesArgs>): Promise<null> {
  for (const each of workspace === undefined ? await workspacesWithARegistry(ctx) : [workspace]) {
    await reserveSharedNamesIn(ctx, each);
    await reserveCatalogueNamesIn(ctx, each);
  }
  return null;
}
export const reserveSharedEmojiNamesJob = mutationJob("album.emojiNames.reserveSharedEmojiNames", reserveSharedEmojiNamesArgs, reserveSharedEmojiNames);

async function workspacesWithARegistry(ctx: QueryContext): Promise<string[]> {
  const firstUses = await allIn<Doc<"emojiNames">>(ctx, emojiNames, byEmoji, and(eq(emojiNames.emoji, firstUse), isNull(emojiNames.person)));
  return firstUses.map(({ workspace }) => workspace);
}

async function reserveSharedNamesIn(ctx: MutationContext, workspace: string) {
  if ((await registeredAs(ctx, workspace, firstUse)) !== null) return;
  await reserveCatalogueNamesIn(ctx, workspace);
  await reserveCompanyTeamNamesIn(ctx, workspace);
}

async function moveBareTeamNamesToTheTeamPrefixIn(ctx: MutationContext, workspace: string) {
  const teamNames = new Map((await companyTeamsOf(ctx)).map(({ team, name }) => [team, name]));
  for (const row of await teamEmojiRowsIn(ctx, workspace)) {
    if (row.mappedBy !== undefined || row.name.startsWith(teamPrefixed(""))) continue;
    const [, team] = splitOnce(row.emoji);
    await patchIn(ctx, emojiNames, row, { name: await firstFreeName(ctx, workspace, teamNameShapeOf(teamNames.get(team) ?? team)) });
  }
}

function teamEmojiRowsIn(ctx: QueryContext, workspace: string) {
  return allIn<Doc<"emojiNames">>(ctx, emojiNames, byWorkspaceEmoji, and(eq(emojiNames.workspace, workspace), gte(emojiNames.emoji, "team:"), lt(emojiNames.emoji, "team:\uffff")));
}

async function reserveCatalogueNamesIn(ctx: MutationContext, workspace: string) {
  for (const level of emojiLevels) await allocate(ctx, workspace, levelEmojiIdOf(level), levelNameShapeOf(level));
  await reserveLevelTwoNameIn(ctx, workspace);
  for (const { milestone, tier, name } of milestoneTierEmojis) await allocate(ctx, workspace, `milestone:${milestone}:${tier}`, { slug: slugOf(name), empty: "milestone", suffix: "" });
}

async function reserveCompanyTeamNamesIn(ctx: MutationContext, workspace: string, only: (slug: string) => boolean = () => true) {
  const teams = (await companyTeamsOf(ctx)).toSorted((one, other) => one.team.localeCompare(other.team));
  for (const { team, name } of teams) {
    const shape = teamNameShapeOf(name);
    if (only(shape.slug)) await allocate(ctx, workspace, `team:${team}`, shape);
  }
}

async function reserveLevelTwoNameIn(ctx: MutationContext, workspace: string) {
  const emoji = levelEmojiIdOf(levelTwoEmoji.level);
  if ((await registeredAs(ctx, workspace, emoji)) !== null) return;
  const name = (await isTakenOrClassed(ctx, workspace, levelTwoEmoji.name)) ? await firstFreeName(ctx, workspace, levelNameShapeOf(levelTwoEmoji.level)) : levelTwoEmoji.name;
  await insertInto(ctx, emojiNames, { workspace, ...storedKeyOf(emoji), name });
}

function levelEmojiIdOf(level: number): EarnedEmojiId {
  return `level:${level}`;
}

function levelNameShapeOf(level: number | string): NameShape {
  return { slug: `level-${level}`, empty: "level", suffix: "" };
}

function reserveTeamNamesShapedLikeHypes(ctx: MutationContext, workspace: string) {
  return reserveCompanyTeamNamesIn(ctx, workspace, (slug) => slug.endsWith(hypeSuffix));
}

type NameShape = { slug: string; empty: string; suffix: string };

function teamNameShapeOf(teamName: string): NameShape {
  const slug = slugOf(teamName);
  return { slug: slug === "" ? "" : teamPrefixed(slug), empty: teamStem, suffix: "" };
}

export function teamPrefixed(slug: string): string {
  return `${teamStem}-${slug}`;
}

async function allocate(ctx: MutationContext, workspace: string, emoji: EarnedEmojiId, shape: NameShape): Promise<void> {
  if ((await registeredAs(ctx, workspace, emoji)) !== null) return;
  await insertInto(ctx, emojiNames, { workspace, ...storedKeyOf(emoji), name: await firstFreeName(ctx, workspace, shape) });
}

type AlsoTaken = (name: string) => Promise<boolean>;

type FreeName = { name: string; number?: number };

function firstCandidateOf({ slug, empty, suffix }: NameShape): string {
  return slug === "" ? `${empty}-1${suffix}` : `${slug}${suffix}`;
}

async function firstFreeName(ctx: MutationContext, workspace: string, shape: NameShape, alsoTaken: AlsoTaken = async () => false): Promise<string> {
  const { name, number } = await nextFreeName(ctx, workspace, shape, alsoTaken);
  if (number !== undefined) await recordNumberOf(ctx, workspace, shape, number);
  return name;
}

async function nextFreeName(ctx: QueryContext, workspace: string, shape: NameShape, alsoTaken: AlsoTaken, numberedPast?: number): Promise<FreeName> {
  const { slug, empty, suffix } = shape;
  const isFreeHere = async (name: string) => !(await alsoTaken(name)) && (await isFree(ctx, workspace, name));
  const plain = firstCandidateOf(shape);
  if (slug !== "" && (await isFreeHere(plain))) return { name: plain };
  const stem = slug === "" ? empty : slug;
  const last = numberedPast ?? (await numberingOf(ctx, workspace, numberedStemOf(shape)))?.last ?? (slug === "" ? 0 : 1);
  for (let n = last + 1; ; n += 1) {
    const name = `${stem}-${n}${suffix}`;
    if (await isFreeHere(name)) return { name, number: n };
  }
}

async function recordNumberOf(ctx: MutationContext, workspace: string, shape: NameShape, last: number): Promise<void> {
  const stem = numberedStemOf(shape);
  const numbering = await numberingOf(ctx, workspace, stem);
  if (numbering === null) await insertInto(ctx, emojiNameNumbers, { workspace, stem, last });
  else await patchIn(ctx, emojiNameNumbers, numbering, { last });
}

function numberedStemOf({ slug, empty, suffix }: NameShape): string {
  return `${slug === "" ? empty : slug}${suffix}`;
}

async function isFree(ctx: QueryContext, workspace: string, name: string) {
  return !isStandardEmojiName(name) && !(await isTakenOrClassed(ctx, workspace, name));
}

async function isTakenOrClassed(ctx: QueryContext, workspace: string, name: string) {
  return (await nameTaken(ctx, workspace, name)) || (await isClassed(ctx, workspace, name));
}

function numberingOf(ctx: QueryContext, workspace: string, stem: string) {
  return uniqueIn<Doc<"emojiNameNumbers">>(ctx, emojiNameNumbers, numbersByWorkspaceStem, and(eq(emojiNameNumbers.workspace, workspace), eq(emojiNameNumbers.stem, stem)));
}

function registeredAs(ctx: QueryContext, workspace: string, emoji: EarnedEmojiId) {
  const { emoji: key, person } = storedKeyOf(emoji);
  return uniqueIn<Doc<"emojiNames">>(ctx, emojiNames, byWorkspaceEmoji, and(eq(emojiNames.workspace, workspace), eq(emojiNames.emoji, key), personIs(person)));
}

function storedKeyOf(emoji: EarnedEmojiId): { emoji: string; person?: MemberId } {
  const [kind, ...rest] = emoji.split(":");
  return kind === "hype" ? { emoji: kind, person: rest.join(":") as MemberId } : { emoji: goldKeepsTheKeyItHadAlone(emoji) };
}

function goldKeepsTheKeyItHadAlone(emoji: EarnedEmojiId): string {
  return emoji.replace(/^(milestone:[a-z]+):gold$/, "$1");
}

function goldOfTheKeyItHadAlone(storedKey: string): string {
  return storedKey.replace(/^(milestone:[a-z]+)$/, "$1:gold");
}

function emojiIdOf({ emoji, person }: { emoji: string; person?: MemberId }): EarnedEmojiId {
  return (person === undefined ? goldOfTheKeyItHadAlone(emoji) : `hype:${person}`) as EarnedEmojiId;
}

function holderOf(ctx: QueryContext, workspace: string, name: string) {
  return uniqueIn<Doc<"emojiNames">>(ctx, emojiNames, byWorkspaceName, and(eq(emojiNames.workspace, workspace), eq(emojiNames.name, name)));
}

function secondHolderOf(ctx: QueryContext, workspace: string, name: string) {
  return uniqueIn<Doc<"secondEmojiNames">>(ctx, secondEmojiNames, secondByWorkspaceName, and(eq(secondEmojiNames.workspace, workspace), eq(secondEmojiNames.name, name)));
}

function namedRowsIn(ctx: QueryContext, workspace: string) {
  return allIn<Doc<"emojiNames">>(ctx, emojiNames, byWorkspaceName, eq(emojiNames.workspace, workspace));
}

// Convex's `.eq("person", undefined)` matches a missing field, which Postgres holds as NULL.
function personIs(person: MemberId | undefined): SQL {
  return person === undefined ? isNull(emojiNames.person) : eq(emojiNames.person, person);
}

async function nameTaken(ctx: QueryContext, workspace: string, name: string) {
  return (await emojiNamed(ctx, workspace, name)) !== null;
}
