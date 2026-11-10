export type Entry = { id: string; name: string; value: number };

export type BoardRow = { rank: number; id: string; name: string; value: number; viewer: boolean };

export type BoardView = {
  rows: Array<BoardRow | { gap: true }>;
  viewerAbsent?: "not-ranked" | "left";
};

export type Placed<E extends Entry> = E & { position: number; rank: number; tied: boolean; viewer: boolean };

export type Ranking<E extends Entry> = { rows: Array<Placed<E>>; window: number[] };

const topPositions = 3;
const positionsAroundViewer = 3;
const mostRows = 10;
const lastPositionShowingTheFirstTen = mostRows - positionsAroundViewer;

export function board(entries: Entry[], viewer: string | null): BoardView {
  const { rows, window } = ranking(entries, viewer);
  const shown = window.flatMap((position, index) => [
    ...(skipsBefore(window, index) ? [{ gap: true as const }] : []),
    boardRowOf(rows[position - 1]!),
  ]);
  return rows.some((row) => row.viewer) ? { rows: shown } : { rows: shown, viewerAbsent: "not-ranked" };
}

export function ranking<E extends Entry>(entries: E[], viewer: string | null): Ranking<E> {
  const rows = rankedRows(entries, viewer);
  return { rows, window: windowOf(rows.length, rows.findIndex((row) => row.viewer) + 1) };
}

export function placesClimbed(now: Entry[], before: Entry[]): Map<string, number> {
  const positionBefore = new Map(rankedRows(before, null).map((row) => [row.id, row.position]));
  return new Map(rankedRows(now, null).flatMap(({ id, position }) => climbOf(id, positionBefore.get(id), position)));
}

function climbOf(id: string, before: number | undefined, now: number): Array<[string, number]> {
  return before !== undefined && before > now ? [[id, before - now]] : [];
}

export function windowOf(ranked: number, viewerPosition: number): number[] {
  if (viewerPosition === 0) return positions(1, Math.min(topPositions, ranked));
  if (viewerPosition <= lastPositionShowingTheFirstTen) return positions(1, Math.min(mostRows, ranked));
  const aroundViewer = positions(viewerPosition - positionsAroundViewer, Math.min(viewerPosition + positionsAroundViewer, ranked));
  return [...positions(1, topPositions), ...aroundViewer];
}

function positions(first: number, last: number) {
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

function skipsBefore(window: number[], index: number) {
  return index > 0 && window[index]! > window[index - 1]! + 1;
}

function rankedRows<E extends Entry>(entries: E[], viewer: string | null): Array<Placed<E>> {
  const ordered = entries.filter((entry) => entry.value > 0).toSorted(byValueThenName);
  const rankOf = (entry: E) => ordered.findIndex((other) => other.value === entry.value) + 1;
  return ordered.map((entry, index) => ({
    ...entry,
    position: index + 1,
    rank: rankOf(entry),
    tied: ordered.some((other) => other !== entry && other.value === entry.value),
    viewer: entry.id === viewer,
  }));
}

function boardRowOf({ rank, id, name, value, viewer }: Placed<Entry>): BoardRow {
  return { rank, id, name, value, viewer };
}

function byValueThenName(a: Entry, b: Entry) {
  return b.value - a.value || a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id);
}
