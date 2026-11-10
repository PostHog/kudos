// A person's page in a member's album: their tally with the owner, whether the owner holds them, their company teams
// and their hype emoji. Today's convex/album/personPage.ts, read by the website and the link previews.
import { storedCompanyMatchOf } from "../companyProfiles/storedFaces.ts";
import { companyTeamsOf, type TeamCrestArt } from "../companyProfiles/teams.ts";
import { isAPersonOf, type MemberId } from "../workspace/directory.ts";
import { hypeEarnedBy, hypeEmojiOf as shownHypeEmojiOf, hypeUnlockedByReactions } from "./earnedEmojis.ts";
import { hypeByReactionsShownTo } from "./flag.ts";
import { reactionsToward, type ReactionsToward } from "./hypeCollections.ts";
import type { PageOwner } from "./teamPages.ts";
import { inTheAlbumOf } from "./stickers.ts";
import { anEmptyPair, pairTallyFor, type PairTally } from "./tallies.ts";
import type { QueryContext } from "../operations.ts";

export type PersonTeam = { team: string; name: string; art: TeamCrestArt };

export type HypeEmoji = { earned: boolean; name: string | null; picture: string | null; inSlack: boolean; reactions?: ReactionsToward; byReactions?: true };

export type PersonPage = PairTally & { held: boolean; teams: PersonTeam[]; hype: HypeEmoji };

export async function personPageOf(ctx: QueryContext, owner: PageOwner, person: MemberId): Promise<PersonPage | null> {
  if (!(await isAPersonOf(ctx, owner.workspace, person))) return null;
  return {
    ...((await pairTallyFor(ctx, owner.member, person)) ?? anEmptyPair()),
    held: owner.member === person || (await inTheAlbumOf(ctx, owner.member, person)),
    teams: await personTeamsOf(ctx, owner.workspace, person),
    hype: await hypeEmojiOf(ctx, owner, person),
  };
}

export async function personTeamsOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<PersonTeam[]> {
  const profile = (await storedCompanyMatchOf(ctx, workspace, person))?.profile ?? null;
  if (profile === null) return [];
  return (await companyTeamsOf(ctx))
    .filter(({ people }) => people.includes(profile))
    .map(({ team, name, crest }) => ({ team, name, art: crest }))
    .sort((one, other) => one.name.localeCompare(other.name) || one.team.localeCompare(other.team));
}

async function hypeEmojiOf(ctx: QueryContext, { workspace, member }: PageOwner, person: MemberId): Promise<HypeEmoji> {
  const shown = await shownHypeEmojiOf(ctx, workspace, person);
  const earned = await hypeEarnedBy(ctx, member, person);
  return { earned, name: shown?.name ?? null, picture: shown?.picture ?? null, inSlack: shown?.inSlack ?? false, ...(await collectingByReactionsOf(ctx, member, person, earned)) };
}

async function collectingByReactionsOf(ctx: QueryContext, member: MemberId, person: MemberId, earned: boolean): Promise<Pick<HypeEmoji, "reactions" | "byReactions">> {
  if (member === person) return {};
  const byReactions = earned && (await hypeUnlockedByReactions(ctx, member, person)) ? { byReactions: true as const } : {};
  return (await hypeByReactionsShownTo(ctx, member)) ? { reactions: await reactionsToward(ctx, member, person), ...byReactions } : byReactions;
}
