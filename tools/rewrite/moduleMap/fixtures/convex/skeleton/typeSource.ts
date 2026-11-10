// What a skeleton imports from: a module whose loading would close a cycle if a skeleton kept it only for types.
export type Note = { text: string };
export type Shape = "round" | "square";
export const defaultNote: Note = { text: "" };
export const shapes: readonly Shape[] = ["round", "square"];
export default class Board {
  notes: Note[] = [];
}
