// Who a website request is. The edge signs the browser in through single sign-on and sends the signed-in email in
// `x-auth-request-email` to the API's paths only (the app drops it everywhere else). The email names a member through
// the workspace's directory, matched without regard to case; an email the directory lacks is asked of Slack, outside
// any transaction, so someone who joined since the last directory sync still signs in, as a person being verified.
import { and, asc, eq, sql } from "drizzle-orm";
import { ReportableError } from "../analytics/exceptions.ts";
import { members } from "../db/schema/index.ts";
import type { Log } from "../log.ts";
import type { Operations, QueryContext } from "../operations.ts";
import { signInWorkspace } from "../slack/signIn.ts";
import { readSlack } from "../slack/webApi.ts";
import type { Identify, Identity } from "./api/transport.ts";

/** The header the edge names the signed-in person in, by their email. */
export const edgeEmailHeader = "x-auth-request-email";

const signedOut = { kind: "signed-out" } as const;
const notAMember = { kind: "not-a-member" } as const;

type SlackPerson = { user: { id: string; team_id?: string } };

/** Maps the edge's email to the chat identity it is, or to who it isn't. */
export function identifyByEmail({ operations, log }: { operations: Operations; log: Log }): Identify {
  return async (request): Promise<Identity> => {
    const email = request.headers.get(edgeEmailHeader)?.trim() ?? "";
    const workspace = signInWorkspace();
    if (email === "" || workspace === undefined) return signedOut;

    const listed = await operations.query("website.identity.listedWith", (ctx) => usersListedWith(ctx, workspace, email));
    if (listed.length > 1) {
      log.error("two directory entries hold one email", { workspace });
      return notAMember;
    }
    if (listed[0] !== undefined) return { workspace, user: listed[0] };

    const answer = await readSlack<SlackPerson>("users.lookupByEmail", { email });
    if (!answer.ok) {
      if (answer.error === "users_not_found") return notAMember;
      throw new ReportableError(`Slack users.lookupByEmail answered ${answer.error}`);
    }
    if (answer.user.team_id !== undefined && answer.user.team_id !== workspace) return notAMember;
    return { workspace, user: answer.user.id };
  };
}

// The users whose directory entry holds the email, at most two: a second one makes the email name nobody. The
// directory has no index by email (the schema keeps Convex's indexes), so this reads the workspace's entries.
async function usersListedWith(ctx: QueryContext, workspace: string, email: string): Promise<string[]> {
  const rows = await ctx.tx
    .select({ user: members.user })
    .from(members)
    .where(and(eq(members.workspace, workspace), sql`lower(${members.email}) = lower(${email})`))
    .orderBy(asc(members.user))
    .limit(2);
  return rows.map(({ user }) => user);
}
