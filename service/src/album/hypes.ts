// A hype emoji by its name in a workspace: whose it is, and whether the reacting member holds it. Today's
// convex/album/hypes.ts.
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { hypeEarnedBy } from "./earnedEmojis.ts";
import { emojiNamed } from "./emojiNames.ts";

export type HypeEmoji = { owner: MemberId; held: boolean };

const hypePrefix = "hype:";

export async function hypeEmojiFor(ctx: QueryContext, workspace: string, giver: MemberId | null, name: string): Promise<HypeEmoji | null> {
  const owner = ownerOf(await emojiNamed(ctx, workspace, name));
  if (owner === null) return null;
  return { owner, held: giver !== null && (await hypeEarnedBy(ctx, giver, owner)) };
}

function ownerOf(emoji: string | null): MemberId | null {
  return emoji?.startsWith(hypePrefix) === true ? (emoji.slice(hypePrefix.length) as MemberId) : null;
}
