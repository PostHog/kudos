import { fromTheNewestDecided, type DecidedBelow } from "../engine/awards.ts";

export type Rank = 0 | 1 | 2 | 3 | 4 | 5;

export const ranks = { levelUp: 0, kudosGiven: 1, kudosReceived: 2, found: 3, hugGiven: 4, hugReceived: 5 } as const satisfies Record<string, Rank>;

export type Position = { decided: number; rank: Rank };

export type Cursor = { after: Position; hugsAsOf?: number };

export type Instant = { at: number; rank: Rank; created: number };

const decidedCursor = /^d(\d+(?:\.\d+)?)_([0-5])(?:_(\d+(?:\.\d+)?))?$/;

const instantCursor = /^(-?\d+(?:\.\d+)?)_([0-5])_(\d+(?:\.\d+)?)(?:_(\d+(?:\.\d+)?))?$/;

export function keyOf({ at, rank, created }: Instant): string {
  return `${at}_${rank}_${created}`;
}

export function encodeCursor({ after: { decided, rank }, hugsAsOf }: Cursor): string {
  const position = `d${decided}_${rank}`;
  return hugsAsOf === undefined ? position : `${position}_${hugsAsOf}`;
}

export function decodeCursor(cursor: string): Cursor {
  const decided = decidedCursor.exec(cursor);
  if (decided !== null) return cursorOf({ decided: Number(decided[1]), rank: Number(decided[2]) as Rank }, decided[3]);
  const instant = instantCursor.exec(cursor);
  if (instant !== null) return cursorOf(decidedAtInstant({ at: Number(instant[1]), rank: Number(instant[2]) as Rank, created: Number(instant[3]) }), instant[4]);
  throw new Error("unreadable activity cursor");
}

function cursorOf(after: Position, hugsAsOf: string | undefined): Cursor {
  return hugsAsOf === undefined ? { after } : { after, hugsAsOf: Number(hugsAsOf) };
}

function decidedAtInstant({ at, rank, created }: Instant): Position {
  return { decided: rank === ranks.found ? at : created, rank };
}

export function newestFirst(one: Position, other: Position): number {
  return other.decided - one.decided || one.rank - other.rank;
}

export function belowFor(rank: Rank, after: Position | null): DecidedBelow {
  if (after === null) return fromTheNewestDecided;
  return { decided: after.decided, inclusive: rank > after.rank };
}
