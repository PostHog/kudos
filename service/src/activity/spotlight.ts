// The workspace's spotlight, as today's convex/activity/spotlight.ts: one drawable kudos from a seed or a cursor,
// walking once around the draw, the engine's guard turning away what may not be shown.
import type { QueryContext } from "../operations.ts";
import { drawFrom, type DrawableKudos } from "../engine/spotlight.ts";
import { beforeEveryDrawAt, type DrawPoint, type DrawWalk, type Drawn } from "../engine/spotlightDraws.ts";
import type { Spotlight } from "./entries.ts";
import { mentionLookupsPerPage, mentionsOfOnePage, permalinkOfMessage, personOf, readableSegmentsOf } from "./kudos.ts";

export type SpotlightFrom = { seed: number } | { after: string };

const number = String.raw`\d+(?:\.\d+)?(?:e-\d+)?`;
const encodedPoint = String.raw`(${number})_(${number})`;
const encodedCursor = new RegExp(`^${encodedPoint}(?:~${encodedPoint})?$`);

export async function spotlightOf(ctx: QueryContext, workspace: string, from: SpotlightFrom): Promise<Spotlight> {
  const walk = walkOf(from);
  const draw = await drawFrom(ctx, workspace, walk);
  if (draw.kind === "empty") return draw;
  if (draw.kind === "skipped") return { kind: "skipped", after: encodeCursor({ after: draw.at, through: walk.through }) };
  return kudosAnswer(ctx, draw.drawn, draw.kudos, draw.mentionLookups);
}

async function kudosAnswer(ctx: QueryContext, drawn: Drawn, { at, giver, recipients, segments, edited }: DrawableKudos, mentionLookups: number): Promise<Spotlight> {
  const [giverPerson, recipientPeople, readable, permalink] = await Promise.all([
    personOf(ctx, giver),
    Promise.all(recipients.map((recipient) => personOf(ctx, recipient))),
    readableSegmentsOf(mentionsOfOnePage(ctx, Math.min(mentionLookups, mentionLookupsPerPage)), drawn.ref.workspace, segments),
    permalinkOfMessage(ctx, drawn.ref),
  ]);
  const after = encodeCursor({ after: drawn, through: drawn });
  return { kind: "kudos", after, at, giver: giverPerson, recipients: recipientPeople, permalink, message: { kind: "text", segments: readable, edited } };
}

function walkOf(from: SpotlightFrom): DrawWalk {
  if ("after" in from) return decodeCursor(from.after);
  const seed = beforeEveryDrawAt(isDrawPosition(from.seed) ? from.seed : 0);
  return { after: seed, through: seed };
}

function encodeCursor({ after, through }: DrawWalk): string {
  const point = ({ position, created }: DrawPoint) => `${position}_${created}`;
  return isSamePoint(after, through) ? point(after) : `${point(after)}~${point(through)}`;
}

function decodeCursor(cursor: string): DrawWalk {
  const parts = encodedCursor.exec(cursor);
  if (parts === null) throw new Error("unreadable spotlight cursor");
  const after = { position: Number(parts[1]), created: Number(parts[2]) };
  const through = parts[3] === undefined ? after : { position: Number(parts[3]), created: Number(parts[4]) };
  if (!isDrawPoint(after) || !isDrawPoint(through)) throw new Error("unreadable spotlight cursor");
  return { after, through };
}

function isSamePoint(one: DrawPoint, other: DrawPoint) {
  return one.position === other.position && one.created === other.created;
}

function isDrawPoint({ position, created }: DrawPoint) {
  return isDrawPosition(position) && Number.isFinite(created) && created >= 0;
}

function isDrawPosition(position: number) {
  return Number.isFinite(position) && position >= 0 && position < 1;
}
