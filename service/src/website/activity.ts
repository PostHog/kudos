// The module map's skeleton of convex/website/activity.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Activity, RecentKudos, Spotlight } from "../activity/entries.ts";
import { type ActivityWeek } from "./activityWeek.ts";
import { type Denial } from "./memberQuery.ts";

export type { Activity, ActivityEntry, Channel, Found, KudosGiven, KudosReceived, LevelUp, Message, Person, QuestDone, RecentKudos, Segment, Spotlight, HugGiven, HugReceived } from "../activity/entries.ts";

export type { ActivityWeek, LastWeek, NextStep, Thanks } from "./activityWeek.ts";

export type { LoopLesson } from "../album/items/welcome.ts";

export type { ActivityState } from "../analytics/projections.ts";

type NotFound = { kind: "not-found" };

export type ActivityWeekRead = { kind: "off" } | { kind: "edition" } | ActivityWeek;

export type MyActivityWeek = Denial | ActivityWeekRead;

export type ActivityViewAnswer = { kind: "viewed" } | { kind: "refused" };

export type ActivityAnswer = NotFound | Activity;

export type RecentKudosAnswer = NotFound | RecentKudos;

export type MyActivity = Denial | ActivityAnswer;

export type MyRecentKudos = Denial | RecentKudosAnswer;

export type SpotlightAnswer = NotFound | Spotlight;

export type MySpotlight = Denial | SpotlightAnswer;
