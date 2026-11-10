import type { Drop } from "../album/hoggies/drops.ts";
import type { PerkId } from "../progression/tree.ts";
import type { Face } from "../website/faces.ts";

export type Person = { name: string; face: Face };

export type Segment =
  | { kind: "text"; text: string; bold?: true; italic?: true; strike?: true; code?: true }
  | { kind: "person"; name: string; person?: string }
  | { kind: "group"; handle: string }
  | { kind: "channel" }
  | { kind: "broadcast"; range: "here" | "channel" | "everyone" }
  | { kind: "emoji"; name: string; unicode?: string; image?: string }
  | { kind: "link"; url: string; label?: string }
  | { kind: "break" };

export type Message = { kind: "text"; segments: Segment[]; edited: boolean } | { kind: "unavailable"; reason: "deleted" | "removed" | "not-captured" };

export type Channel = { visibility: "public" | "private" | "unknown" };

export type QuestDone = { kind: "weekly" | "journey"; goal: string; xp: number; hoggie: boolean };

export function questXpOf(quests: QuestDone[]): number {
  return quests.reduce((sum, { xp }) => sum + xp, 0);
}

export type BonusEarned = { perk: { id: PerkId; name: string }; why: string; xp: number };

export type KudosReceived = {
  kind: "kudosReceived";
  key: string;
  at: number;
  giver: Person;
  channel: Channel;
  saidWhy: boolean | null;
  permalink: string | null;
  message: Message;
};

export type KudosGiven = {
  kind: "kudosGiven";
  key: string;
  at: number;
  recipients: Person[];
  kudos: number;
  channel: Channel;
  saidWhy: boolean | null;
  permalink: string | null;
  message: Message;
  earned: { xp: number | null; questsDone: QuestDone[]; bonuses: BonusEarned[] } | null;
};

export type LevelUp = { kind: "levelUp"; at: number; level: number };

export type Found = { kind: "found"; at: number; key: string; drop: Drop };

export type HugReceived = { kind: "hugReceived"; key: string; at: number; givers: Person[]; emoji: string; emojiImage?: string; hugs: number; xp: number | null; on: string; permalink: string | null; kudos: Message | null };

export type HugGiven = { kind: "hugGiven"; key: string; at: number; people: Person[]; emoji: string; emojiImage?: string; xp: number | null; on: string; permalink: string | null; kudos: Message | null };

export type ActivityEntry = KudosReceived | KudosGiven | LevelUp | Found | HugGiven | HugReceived;

export type Activity = { kind: "activity"; entries: ActivityEntry[]; cursor: string | null; timeZone: string | null };

export type RecentKudos = { kind: "recent"; entries: Array<KudosReceived | KudosGiven> };

export type Spotlight =
  | { kind: "empty" }
  | { kind: "skipped"; after: string }
  | { kind: "kudos"; after: string; at: number; giver: Person; recipients: Person[]; permalink: string | null; message: Extract<Message, { kind: "text" }> };
