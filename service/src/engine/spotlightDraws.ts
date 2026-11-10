// The spotlight's draws: each drawable kudos message holds a random position in its workspace, and a walk along the
// positions from one draw point through another (wrapping past the end) draws what lies between. Today's
// convex/engine/spotlightDraws.ts over the service's transaction.
import { and, eq, gt, gte, lt, lte, type SQL } from "drizzle-orm";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { spotlightDraws, type Doc } from "../db/schema/index.ts";
import { streamed } from "../db/stream.ts";
import { unique } from "../db/unique.ts";
import type { MessageRef } from "./messageEvent.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export type DrawPoint = { position: number; created: number };

export type Drawn = DrawPoint & { ref: MessageRef };

export type DrawWalk = { after: DrawPoint; through: DrawPoint };

type PositionRange =
  | { kind: "between"; from: number; inclusive: boolean; below?: number }
  | { kind: "tied"; position: number; createdAbove?: number; createdAtMost?: number };

type DrawRow = Doc<"spotlightDraws">;

const lowestPosition = 0;

const byPosition = indexOrder(spotlightDraws, ["workspace", "position"]);
const byMessage = indexOrder(spotlightDraws, ["workspace", "conversation", "message"]);

export async function placeInSpotlight(ctx: MutationContext, ref: MessageRef, drawable: boolean): Promise<void> {
  const draw = await drawOf(ctx, ref);
  if (drawable && draw === null) await ctx.tx.insert(spotlightDraws).values(fromDocument(spotlightDraws, { ...ctx.newRow(), ...ref, position: Math.random() }) as typeof spotlightDraws.$inferInsert);
  if (!drawable && draw !== null) await ctx.tx.delete(spotlightDraws).where(eq(spotlightDraws._id, draw._id));
}

export async function dropFromSpotlight(ctx: MutationContext, ref: MessageRef): Promise<void> {
  await placeInSpotlight(ctx, ref, false);
}

export function beforeEveryDrawAt(position: number): DrawPoint {
  return { position, created: 0 };
}

export async function* drawnAlong({ tx }: QueryContext, workspace: string, walk: DrawWalk): AsyncGenerator<Drawn> {
  for (const range of rangesAlong(walk)) {
    const rows = streamed<DrawRow>(tx, { table: spotlightDraws, order: byPosition, where: and(eq(spotlightDraws.workspace, workspace), withinRange(range)) });
    for await (const { workspace, conversation, message, position, _creationTime } of rows) yield { ref: { workspace, conversation, message }, position, created: _creationTime };
  }
}

// One range of the walk on the position index, as today's `.withIndex` bounds read it.
function withinRange(range: PositionRange): SQL | undefined {
  if (range.kind === "tied") {
    return and(
      eq(spotlightDraws.position, range.position),
      range.createdAbove === undefined ? undefined : gt(spotlightDraws._creationTime, range.createdAbove),
      range.createdAtMost === undefined ? undefined : lte(spotlightDraws._creationTime, range.createdAtMost),
    );
  }
  return and(range.inclusive ? gte(spotlightDraws.position, range.from) : gt(spotlightDraws.position, range.from), range.below === undefined ? undefined : lt(spotlightDraws.position, range.below));
}

function rangesAlong({ after, through }: DrawWalk): PositionRange[] {
  if (comesBefore(after, through)) {
    if (after.position === through.position) return [{ kind: "tied", position: after.position, createdAbove: after.created, createdAtMost: through.created }];
    return [
      { kind: "tied", position: after.position, createdAbove: after.created },
      { kind: "between", from: after.position, inclusive: false, below: through.position },
      { kind: "tied", position: through.position, createdAtMost: through.created },
    ];
  }
  return [
    { kind: "tied", position: after.position, createdAbove: after.created },
    { kind: "between", from: after.position, inclusive: false },
    { kind: "between", from: lowestPosition, inclusive: true, below: through.position },
    { kind: "tied", position: through.position, createdAtMost: through.created },
  ];
}

function comesBefore(one: DrawPoint, other: DrawPoint) {
  return one.position < other.position || (one.position === other.position && one.created < other.created);
}

async function drawOf({ tx }: QueryContext, ref: MessageRef): Promise<DrawRow | null> {
  const rows = await tx
    .select()
    .from(spotlightDraws)
    .where(and(eq(spotlightDraws.workspace, ref.workspace), eq(spotlightDraws.conversation, ref.conversation), eq(spotlightDraws.message, ref.message)))
    .orderBy(...byMessage.orderBy())
    .limit(2);
  return unique("spotlightDraws", rows.map((row) => toDocument<DrawRow>(spotlightDraws, row)));
}
