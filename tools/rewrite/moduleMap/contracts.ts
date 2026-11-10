// Service contracts for exports the skeleton generator can't print but another stack imports: a function that returns
// Convex's Query, a class over a context. Each stands, as a stub that throws notPorted, where the generator leaves the
// export out; the stack that owns the module replaces it, and deletes its entry when the module leaves the map.
import type { Contracts } from "./skeleton.ts";

export const contracts: Contracts = {
  "convex/groups/groups.ts": {
    // Leaderboard and website read the workspace's groups; the table holds at most `maxUserGroupsKept` rows.
    userGroupsIn: {
      text: 'export async function userGroupsIn(ctx: QueryContext, workspace: string): Promise<Doc<"userGroups">[]> {\n  throw notPorted("groups.groups.userGroupsIn");\n}',
    },
  },
  "convex/groups/transitions.ts": {
    // Workspace's user group sync keeps each group's changes through one.
    KeepingChanges: {
      text: 'export class KeepingChanges {\n  constructor(_ctx: MutationContext) {}\n\n  async record(group: LoggedGroup, keepsMembers: boolean, at: number): Promise<void> {\n    throw notPorted("groups.transitions.KeepingChanges.record");\n  }\n}',
      uses: ["LoggedGroup"],
    },
  },
};
