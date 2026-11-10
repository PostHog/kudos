import { describe, expect, test } from "vitest";
import { board, type BoardView, type Entry } from "./board.ts";

const names = ["Ann", "Bob", "Cy", "Dee", "Eve", "Fay", "Gus", "Hal", "Ida", "Jo", "Kai", "Lu", "Max", "Ned", "Oz"];

function people(count: number, value: (index: number) => number = (index) => 100 - index): Entry[] {
  return names.slice(0, count).map((name, index) => ({ id: name.toLowerCase(), name, value: value(index) }));
}

function shown(view: BoardView) {
  return view.rows.map((row) => ("gap" in row ? "…" : `${row.rank} ${row.name}${row.viewer ? " (you)" : ""}`));
}

describe("G16: ranking by kudos given", () => {
  test.each([
    {
      rule: "highest first",
      entries: [
        { id: "ann", name: "Ann", value: 2 },
        { id: "bob", name: "Bob", value: 7 },
        { id: "cy", name: "Cy", value: 4 },
      ],
      rows: ["1 Bob", "2 Cy", "3 Ann"],
    },
    {
      rule: "equal totals share a rank, competition style, and list by name",
      entries: [
        { id: "dee", name: "Dee", value: 3 },
        { id: "bob", name: "Bob", value: 5 },
        { id: "ann", name: "Ann", value: 5 },
        { id: "cy", name: "Cy", value: 1 },
      ],
      viewer: "cy",
      rows: ["1 Ann", "1 Bob", "3 Dee", "4 Cy (you)"],
    },
    {
      rule: "names list case-insensitively",
      entries: [
        { id: "bob", name: "bob", value: 1 },
        { id: "ann", name: "Ann", value: 1 },
      ],
      rows: ["1 Ann", "1 bob"],
    },
    {
      rule: "nobody who gave nothing is on it",
      entries: [
        { id: "ann", name: "Ann", value: 0 },
        { id: "bob", name: "Bob", value: 1 },
      ],
      rows: ["1 Bob"],
    },
  ])("$rule", ({ entries, viewer = null, rows }) => {
    expect(shown(board(entries, viewer))).toEqual(rows);
  });
});

describe("G17: the window", () => {
  test.each([
    { rule: "the viewer at position 1 sees positions 1–10", count: 15, viewer: "ann", rows: ["1 Ann (you)", "2 Bob", "3 Cy", "4 Dee", "5 Eve", "6 Fay", "7 Gus", "8 Hal", "9 Ida", "10 Jo"] },
    { rule: "the viewer at position 7 sees positions 1–10", count: 15, viewer: "gus", rows: ["1 Ann", "2 Bob", "3 Cy", "4 Dee", "5 Eve", "6 Fay", "7 Gus (you)", "8 Hal", "9 Ida", "10 Jo"] },
    { rule: "the viewer at position 8 sees the top 3, a gap and positions 5–11", count: 15, viewer: "hal", rows: ["1 Ann", "2 Bob", "3 Cy", "…", "5 Eve", "6 Fay", "7 Gus", "8 Hal (you)", "9 Ida", "10 Jo", "11 Kai"] },
    { rule: "the last viewer sees the top 3, a gap and the three above", count: 15, viewer: "oz", rows: ["1 Ann", "2 Bob", "3 Cy", "…", "12 Lu", "13 Max", "14 Ned", "15 Oz (you)"] },
    { rule: "a short board shows everyone", count: 5, viewer: "eve", rows: ["1 Ann", "2 Bob", "3 Cy", "4 Dee", "5 Eve (you)"] },
    { rule: "the last viewer at position 8 still skips position 4", count: 8, viewer: "hal", rows: ["1 Ann", "2 Bob", "3 Cy", "…", "5 Eve", "6 Fay", "7 Gus", "8 Hal (you)"] },
  ])("$rule", ({ count, viewer, rows }) => {
    expect(shown(board(people(count), viewer))).toEqual(rows);
  });

  test("eleven people tied at rank 1 never make more than ten rows, for the first or the last of them", () => {
    const tied = people(11, () => 4);

    expect(shown(board(tied, "ann"))).toEqual(["1 Ann (you)", "1 Bob", "1 Cy", "1 Dee", "1 Eve", "1 Fay", "1 Gus", "1 Hal", "1 Ida", "1 Jo"]);
    expect(shown(board(tied, "kai"))).toEqual(["1 Ann", "1 Bob", "1 Cy", "…", "1 Hal", "1 Ida", "1 Jo", "1 Kai (you)"]);
  });

  test.each([
    { rule: "a viewer who gave nothing", viewer: "zed" },
    { rule: "no viewer", viewer: null },
  ])("$rule sees the top 3 and isn't ranked", ({ viewer }) => {
    const view = board(people(15), viewer);

    expect(shown(view)).toEqual(["1 Ann", "2 Bob", "3 Cy"]);
    expect(view.viewerAbsent).toBe("not-ranked");
  });

  test("a ranked viewer isn't absent", () => {
    expect(board(people(3), "bob").viewerAbsent).toBeUndefined();
  });
});
