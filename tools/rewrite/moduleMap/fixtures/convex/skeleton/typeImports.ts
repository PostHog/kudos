// Imports a skeleton keeps only for types, in each form: a stub's body is gone, so only its signature names them.
import type { QueryCtx } from "../_generated/server";
import { type Note } from "./typeSource";
import { shapes, type Shape } from "./typeSource";
import { defaultNote } from "./typeSource";
import * as source from "./typeSource";
import Board, { type Note as Named } from "./typeSource";

export const firstShape: Shape = shapes[0]!;

export async function latest(ctx: QueryCtx, board: Board): Promise<typeof defaultNote> {
  const notes = await ctx.db.query("members").collect();
  return notes.length > 0 ? defaultNote : board.notes[0]!;
}

export async function named(ctx: QueryCtx): Promise<source.Note | Named | Note> {
  return { text: String((await ctx.db.query("members").collect()).length) };
}
