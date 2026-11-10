// Reconciliation: each member's counting groups and primary group, replayed from the transition log since their last
// history entry, in pages a job carries on. Today's convex/groups/reconcile.ts over the service's transaction; the
// page sizes are Convex's limits per write, kept so a page does what it did.
import { and, eq, gt, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { indexOrder } from "../db/indexOrder.ts";
import { memberGroups, members, type Doc } from "../db/schema/index.ts";
import type { ChatUserId } from "../engine/messageEvent.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { userGroupMembershipsOf, userGroupRow } from "../workspace/userGroups.ts";
import { countsAsGroup, groupModeOf, memberGroupsOf, userGroupById, type GroupId, type GroupMode } from "./groups.ts";
import { latestEntryOf, recordChange } from "./history.ts";
import { documentsOf, insertDocument, patchDocument, uniqueOf } from "./rows.ts";
import { countingChangesOf, departuresSince, joinedAtOf, type CountingChange } from "./transitions.ts";

const usersPerPage = 100;
const directoryRowsPerPage = 1_000;
const membershipsPerPage = 8_000;
const indexRangesPerPage = 3_000;
const indexRangesPerPerson = 6;
const indexRangesPerHistoryWrite = 2;

const membersByUser = indexOrder(members, ["workspace", "user"]);

export async function reconcileLater(ctx: MutationContext, workspace: string, users: ChatUserId[]): Promise<void> {
  const sorted = users.toSorted();
  for (let start = 0; start < sorted.length; start += usersPerPage) {
    await ctx.jobs.enqueue(reconcileUsersJob, { workspace, users: sorted.slice(start, start + usersPerPage) });
  }
}

export const reconcileUsersArgs = z.strictObject({ workspace: z.string(), users: z.array(z.string()) });
export async function reconcileUsers(ctx: MutationContext, { workspace, users }: z.infer<typeof reconcileUsersArgs>): Promise<void> {
  const sorted = users.toSorted();
  const [first, last] = [sorted[0], sorted.at(-1)];
  if (first === undefined || last === undefined) return;
  const rows = await ctx.tx
    .select()
    .from(members)
    .where(and(eq(members.workspace, workspace), gte(members.user, first), lte(members.user, last)))
    .orderBy(...membersByUser.orderBy())
    .limit(directoryRowsPerPage);
  const people = documentsOf<Doc<"members">>(members, rows);
  const wanted = new Set(sorted);
  const groups = new GroupRows(ctx, workspace);
  for (const person of people) {
    if (!wanted.has(person.user)) continue;
    if (groups.exhausted()) return reconcileLater(ctx, workspace, sorted.filter((user) => user >= person.user));
    await reconcile(ctx, person, groups);
  }
  const lastRead = people.at(-1)?.user;
  if (people.length === directoryRowsPerPage && lastRead !== undefined) await reconcileLater(ctx, workspace, sorted.filter((user) => user > lastRead));
}
export const reconcileUsersJob = mutationJob("groups.reconcile.reconcileUsers", reconcileUsersArgs, reconcileUsers);

export async function reconcileEveryMemberLater(ctx: MutationContext, workspace: string): Promise<void> {
  await ctx.jobs.enqueue(reconcileWorkspaceJob, { workspace });
}

export const reconcileWorkspaceArgs = z.strictObject({ workspace: z.string(), after: z.optional(z.string()) });
export async function reconcileWorkspace(ctx: MutationContext, { workspace, after }: z.infer<typeof reconcileWorkspaceArgs>): Promise<void> {
  const rows = await ctx.tx
    .select()
    .from(members)
    .where(and(eq(members.workspace, workspace), after === undefined ? undefined : gt(members.user, after)))
    .orderBy(...membersByUser.orderBy())
    .limit(usersPerPage);
  const people = documentsOf<Doc<"members">>(members, rows);
  const groups = new GroupRows(ctx, workspace);
  let reconciled = after;
  for (const person of people) {
    if (groups.exhausted()) break;
    await reconcile(ctx, person, groups);
    reconciled = person.user;
  }
  const lastRead = people.at(-1)?.user;
  if (lastRead === undefined) return;
  if (people.length === usersPerPage || reconciled !== lastRead) await ctx.jobs.enqueue(reconcileWorkspaceJob, { workspace, ...(reconciled !== undefined && { after: reconciled }) });
}
export const reconcileWorkspaceJob = mutationJob("groups.reconcile.reconcileWorkspace", reconcileWorkspaceArgs, reconcileWorkspace);

export async function reconcileUser(ctx: MutationContext, workspace: string, user: ChatUserId, recordedAt?: number): Promise<void> {
  const rows = await ctx.tx
    .select()
    .from(members)
    .where(and(eq(members.workspace, workspace), eq(members.user, user)))
    .orderBy(...membersByUser.orderBy())
    .limit(2);
  const person = uniqueOf<Doc<"members">>(members, rows);
  if (person !== null) await reconcile(ctx, person, new GroupRows(ctx, workspace), recordedAt);
}

export async function reconcileMember(ctx: MutationContext, member: MemberId, recordedAt?: number): Promise<void> {
  const person = await memberById(ctx, member);
  if (person !== null) await reconcile(ctx, person, new GroupRows(ctx, person.workspace), recordedAt);
}

export async function reconcilePageOf(ctx: MutationContext, members: MemberId[]): Promise<MemberId[]> {
  const groups = new Map<string, GroupRows>();
  for (const [index, member] of members.entries()) {
    const person = await memberById(ctx, member);
    if (person === null) continue;
    const rows = groups.get(person.workspace) ?? new GroupRows(ctx, person.workspace);
    groups.set(person.workspace, rows);
    if (index >= usersPerPage || rows.exhausted()) return members.slice(index);
    await reconcile(ctx, person, rows);
  }
  return [];
}

async function memberById(ctx: MutationContext, member: MemberId): Promise<Doc<"members"> | null> {
  return uniqueOf(members, await ctx.tx.select().from(members).where(eq(members._id, member)));
}

type Membership = { row: Doc<"userGroups">; joinedAt: number; leftAt?: number };

/** A membership as the log recorded it, its group possibly gone from the copy. */
type RecordedMembership = Omit<Membership, "row"> & { row: Doc<"userGroups"> | null };

class GroupRows {
  private readonly rows = new Map<string, Promise<Doc<"userGroups"> | null>>();
  private readonly rowsById = new Map<GroupId, Promise<Doc<"userGroups"> | null>>();
  private readonly countingChanges = new Map<GroupId, Promise<CountingChange[]>>();
  private mode: Promise<GroupMode> | undefined;
  private documentsRead = 0;
  private indexRangesRead = 0;

  private readonly ctx: MutationContext;
  private readonly workspace: string;

  constructor(ctx: MutationContext, workspace: string) {
    this.ctx = ctx;
    this.workspace = workspace;
  }

  countHistoryWrites(changes: number) {
    this.indexRangesRead += changes * indexRangesPerHistoryWrite;
  }

  exhausted(): boolean {
    return this.documentsRead >= membershipsPerPage || this.indexRangesRead >= indexRangesPerPage;
  }

  async timelineOf(user: ChatUserId, since: number, reconciled: GroupId[]): Promise<Timeline> {
    // One statement at a time: the operation's transaction is one connection.
    const current = await userGroupMembershipsOf(this.ctx, this.workspace, user);
    const departed = await departuresSince(this.ctx, this.workspace, user, since);
    this.documentsRead += current.length + departed.length;
    this.indexRangesRead += indexRangesPerPerson;
    const recorded: RecordedMembership[] = [];
    for (const membership of current) recorded.push({ row: await this.rowOf(membership.group), joinedAt: joinedAtOf(membership) });
    for (const { group, joinedAt, at } of departed) recorded.push({ row: await this.rowById(group), joinedAt, leftAt: at });
    const unexplained = await this.unexplainedOf(reconciled, recorded);
    const known = [...recorded, ...unexplained].filter((membership): membership is Membership => membership.row !== null);
    const groups = [...new Set(known.map(({ row }) => row._id))];
    const changes = new Map<GroupId, CountingChange[]>();
    for (const group of groups) changes.set(group, await this.countingChangesOf(group));
    return new Timeline(known, changes, await this.modeOf());
  }

  private async unexplainedOf(reconciled: GroupId[], recorded: Array<{ row: Doc<"userGroups"> | null }>) {
    const explained = new Set(recorded.flatMap(({ row }) => (row === null ? [] : [row._id])));
    const missing = [...new Set(reconciled)].filter((group) => !explained.has(group));
    const unexplained: RecordedMembership[] = [];
    for (const group of missing) unexplained.push({ row: await this.rowById(group), joinedAt: Number.NEGATIVE_INFINITY, leftAt: Number.POSITIVE_INFINITY });
    return unexplained;
  }

  private modeOf() {
    this.mode ??= groupModeOf(this.ctx, this.workspace);
    return this.mode;
  }

  private rowOf(group: string) {
    const row = this.rows.get(group) ?? this.readIndexRange(userGroupRow(this.ctx, { workspace: this.workspace, group }));
    this.rows.set(group, row);
    return row;
  }

  private rowById(group: GroupId) {
    const row = this.rowsById.get(group) ?? this.readIndexRange(userGroupById(this.ctx, group));
    this.rowsById.set(group, row);
    return row;
  }

  private readIndexRange<T>(read: Promise<T>): Promise<T> {
    this.indexRangesRead += 1;
    return read;
  }

  private countingChangesOf(group: GroupId) {
    const known = this.countingChanges.get(group);
    if (known !== undefined) return known;
    const changes = this.readIndexRange(countingChangesOf(this.ctx, group)).then((read) => {
      this.documentsRead += read.length;
      return read;
    });
    this.countingChanges.set(group, changes);
    return changes;
  }
}

class Timeline {
  private readonly memberships: Membership[];
  private readonly changes: ReadonlyMap<GroupId, CountingChange[]>;
  private readonly mode: GroupMode;

  constructor(memberships: Membership[], changes: ReadonlyMap<GroupId, CountingChange[]>, mode: GroupMode) {
    this.memberships = memberships;
    this.changes = changes;
    this.mode = mode;
  }

  instantsBetween(since: number, until: number): number[] {
    const instants = this.memberships.flatMap(({ row, joinedAt, leftAt }) => [joinedAt, ...(leftAt === undefined ? [] : [leftAt]), ...this.changesOf(row).map(({ at }) => at)]);
    return [...new Set(instants.filter((at) => at >= since && at <= until))].toSorted((first, second) => first - second);
  }

  countingAt(at: number): Doc<"userGroups">[] {
    return this.memberships.filter(({ row, joinedAt, leftAt = Number.POSITIVE_INFINITY }) => joinedAt <= at && at < leftAt && this.countsAt(row, at)).map(({ row }) => row);
  }

  countingNow(): Doc<"userGroups">[] {
    return this.memberships.filter(({ row, leftAt }) => leftAt === undefined && countsAsGroup(row, this.mode)).map(({ row }) => row);
  }

  private countsAt(row: Doc<"userGroups">, at: number): boolean {
    const changes = this.changesOf(row);
    const inForce = changes.findLast((change) => change.at <= at);
    if (inForce !== undefined) return inForce.counts;
    const next = changes.find((change) => change.at > at);
    return next === undefined ? countsAsGroup(row, this.mode) : !next.counts;
  }

  private changesOf(row: Doc<"userGroups">): CountingChange[] {
    return this.changes.get(row._id) ?? [];
  }
}

async function reconcile(ctx: MutationContext, person: Doc<"members">, groupRows: GroupRows, recordedAt?: number) {
  const row = await memberGroupsOf(ctx, person._id);
  const since = Math.max((await latestEntryOf(ctx, person._id))?.at ?? person._creationTime, row?.directoryChangedAt ?? Number.NEGATIVE_INFINITY);
  const before = row?.primary ?? null;
  const timeline = await groupRows.timelineOf(person.user, since, before === null ? [] : [before]);
  const isMember = person.kind === "member";
  const memberUntil = memberUntilOf(isMember, recordedAt, ctx.now);
  const replayed = memberUntil === undefined ? [] : timeline.instantsBetween(since, memberUntil);
  const counting = isMember ? timeline.countingNow() : [];
  const steps = [...replayed.map((at) => ({ at, counting: timeline.countingAt(at) })), { at: recordedAt ?? ctx.now, counting }];
  let primary = before;
  let changes = 0;
  for (const step of steps) {
    const next = primaryAt(primary, step.counting);
    if (next === primary) continue;
    await recordChange(ctx, person, primary, next, primary === null ? "default" : "fallback", step.at);
    primary = next;
    changes += 1;
  }
  groupRows.countHistoryWrites(changes);
  await keepMemberGroups(ctx, person, row, { groups: [...new Set(counting.map(({ _id }) => _id))], primary, ...(recordedAt !== undefined && { directoryChangedAt: recordedAt }) });
}

type MemberGroups = Pick<Doc<"memberGroups">, "groups" | "primary" | "directoryChangedAt">;

async function keepMemberGroups(ctx: MutationContext, person: Doc<"members">, row: Doc<"memberGroups"> | null, kept: MemberGroups) {
  if (row === null) {
    const fencesReplay = kept.directoryChangedAt !== undefined && kept.directoryChangedAt > person._creationTime;
    if (kept.groups.length > 0 || kept.primary !== null || fencesReplay) await insertDocument(ctx.tx, memberGroups, { ...ctx.newRow(), workspace: person.workspace, member: person._id, ...kept });
    return;
  }
  const unchanged = sameGroups(row.groups, kept.groups) && row.primary === kept.primary && kept.directoryChangedAt === undefined;
  if (!unchanged) await patchDocument(ctx.tx, memberGroups, row, kept);
}

function memberUntilOf(isMember: boolean, recordedAt: number | undefined, now: number): number | undefined {
  if (recordedAt !== undefined) return isMember ? undefined : recordedAt;
  return isMember ? now : undefined;
}

function primaryAt(primary: GroupId | null, counting: Doc<"userGroups">[]): GroupId | null {
  return primary !== null && counting.some(({ _id }) => _id === primary) ? primary : smallestOf(counting);
}

function smallestOf(groups: Doc<"userGroups">[]): GroupId | null {
  const sizeOf = ({ members }: Doc<"userGroups">) => members ?? Number.POSITIVE_INFINITY;
  const bySize = (first: Doc<"userGroups">, second: Doc<"userGroups">) =>
    sizeOf(first) - sizeOf(second) || first.name.localeCompare(second.name) || first.group.localeCompare(second.group);
  return groups.toSorted(bySize)[0]?._id ?? null;
}

function sameGroups(first: GroupId[], second: GroupId[]) {
  return first.length === second.length && first.every((group) => second.includes(group));
}
