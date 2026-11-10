// Team stickers, as today's convex/album/teamStickers.ts: a ready team page unlocks its sticker with the team's emoji,
// earns the team item and records milestones; and the teams unlocked most in a week, for the Monday post.
import { and, eq, gte, lt } from "drizzle-orm";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { teamStickers, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { markEmojiSeen, teamEmojiOf, type ShownEmoji } from "./earnedEmojis.ts";
import { teamEmojiNameOf } from "./emojiNames.ts";
import { earnTeamItem } from "./items/achievements.ts";
import { recordMilestonesOf } from "./milestones.ts";
import type { Instants } from "./packs.ts";
import type { TeamSticker } from "./records.ts";
import { teamPagesOf, type PageOwner, type TeamPage } from "./teamPages.ts";

export async function unlockTeamStickerOf(ctx: MutationContext, owner: PageOwner, team: string, at: number): Promise<TeamSticker | null> {
  const page = (await teamPagesOf(ctx, owner)).find((page) => page.team === team);
  if (page?.state !== "ready") return null;
  const sticker = await insertTeamSticker(ctx, owner, page, at);
  await recordMilestonesOf(ctx, owner, at);
  return sticker;
}

export async function unlockReadyTeamsAmong(ctx: MutationContext, owner: PageOwner, pages: TeamPage[], at: number): Promise<TeamSticker[]> {
  const unlocked: TeamSticker[] = [];
  for (const page of pages.filter(({ state }) => state === "ready")) {
    unlocked.push(await insertTeamSticker(ctx, owner, page, at));
    await markEmojiSeen(ctx, owner.member, `team:${page.team}`, at);
  }
  return unlocked;
}

async function insertTeamSticker(ctx: MutationContext, owner: PageOwner, { team, name, art }: TeamPage, at: number): Promise<TeamSticker> {
  const sticker = { team, name, art, emoji: await teamEmojiNameOf(ctx, owner.workspace, team), at };
  await ctx.tx.insert(teamStickers).values(fromDocument(teamStickers, { ...ctx.newRow(), member: owner.member, workspace: owner.workspace, ...sticker }) as never);
  await earnTeamItem(ctx, owner, { team, name }, at);
  return sticker;
}

type TeamStickersUnlocked = Pick<TeamSticker, "team" | "name" | "art"> & { count: number };

export type UnlockedTeam = Pick<TeamSticker, "name"> & { count: number; emoji: ShownEmoji | null };

export async function teamsUnlockedIn(ctx: QueryContext, workspace: string, week: Instants, most: number): Promise<UnlockedTeam[]> {
  const teams: UnlockedTeam[] = [];
  for (const unlocked of await teamStickersUnlockedIn(ctx, workspace, week, most)) teams.push({ name: unlocked.name, count: unlocked.count, emoji: await teamEmojiOf(ctx, workspace, unlocked) });
  return teams;
}

async function teamStickersUnlockedIn({ tx }: QueryContext, workspace: string, { from, to }: Instants, most: number): Promise<TeamStickersUnlocked[]> {
  const rows = await tx
    .select()
    .from(teamStickers)
    .where(and(eq(teamStickers.workspace, workspace), gte(teamStickers.at, from), lt(teamStickers.at, to)))
    .orderBy(...indexOrder(teamStickers, ["workspace", "at"]).orderBy())
    .limit(most);
  const byTeam = new Map<string, TeamStickersUnlocked>();
  for (const { team, name, art } of rows.map((row) => toDocument<Doc<"teamStickers">>(teamStickers, row))) byTeam.set(team, { team, name, art, count: (byTeam.get(team)?.count ?? 0) + 1 });
  return [...byTeam.values()].sort((one, other) => other.count - one.count || one.name.localeCompare(other.name));
}
