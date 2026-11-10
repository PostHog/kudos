// The module map's skeleton of convex/website/xpMoment.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type QuestDone } from "../activity/entries.ts";
import { type EntrySince } from "../activity/activity.ts";
import { type WaitingCount } from "../album/items/ledger.ts";
import { type Progressed } from "./progressed.ts";
import { type ArrivalAnswer } from "./lastVisit.ts";

export type { EntrySince } from "../activity/activity.ts";

export type Excerpt = { entry: EntrySince; xp: number };

export type Fold = { count: number; xp: number };

export type Standing = { level: number; xp: number; startsAt: number; nextAt: number };

export type Climb = { from: Standing; to: Standing };

export type XpMoment = {
  kind: "moment";
  since: number;
  until: number;
  excerpts: Excerpt[];
  fold: Fold | null;
  moments: number;
  xp: number;
  climb: Climb;
  quests: QuestDone[];
  progressed: Progressed[];
  waiting: WaitingCount;
  thoughtfulGivers: number | null;
  timeZone: string | null;
};

export type XpMomentAnswer = { kind: "off" } | { kind: "none"; lastVisit: number | null } | XpMoment;

export type XpMomentEndReply = ArrivalAnswer;
