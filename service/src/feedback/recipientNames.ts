// How a reply names a recipient, as today's convex/feedback/recipientNames.ts.
import { nameAndPictureOf, type MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export const mostRecipientsNamed = 10;

/** The first word of the member's name, or "Your teammate" when they have none. */
export async function firstNameOf(ctx: QueryContext, person: MemberId): Promise<string> {
  const { name } = await nameAndPictureOf(ctx, person);
  return name?.trim().split(/\s+/)[0] || "Your teammate";
}
