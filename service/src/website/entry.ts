// A website entry: the page load that signs a person in. The edge's single sign-on has no moment of its own the app
// sees, so the website's client sends `POST /api/entry` once per page load, and today's sign-in effects run here, in
// one transaction: S17's `rememberSignedInMember` writes the users row, greets a member on their first entry and asks
// the directory to verify someone it doesn't know yet. It runs only when there is something to do, a first entry or a
// person still being verified, so a member's every other page load reads one row and writes nothing. Reads never
// enter: they stay read-only, and a failed verification restarts only on the person's next page load.
import type { MutationContext } from "../operations.ts";
import { currentNameAndPictureOf } from "../workspace/directory.ts";
import type { Doc } from "../db/schema/index.ts";
import type { Identity, SignedIn } from "./api/transport.ts";
import { displayFieldsIn, usersRowOf, verifiedMember, type Denial } from "./memberQuery.ts";
import { rememberSignedInMember } from "./signIn.ts";

export type Entered = { kind: "entered" };

const entered: Entered = { kind: "entered" };

/** Enters the website for the person the request signs in as; any denial but verifying and unverified writes nothing. */
export async function enter(ctx: MutationContext, identity: Identity): Promise<Entered | Denial> {
  const verified = await verifiedMember(ctx, identity);
  if ("kind" in verified) {
    if ("kind" in identity || (verified.kind !== "verifying" && verified.kind !== "unverified")) return verified;
    await remember(ctx, identity, await usersRowOf(ctx, identity), {});
    return verified;
  }
  if ((await usersRowOf(ctx, verified.me)) === null) {
    const directory = await currentNameAndPictureOf(ctx, verified.me.member);
    await remember(ctx, verified.me, null, { name: directory?.name, image: directory?.picture ?? undefined });
  }
  return entered;
}

// Sign-in replaces the users row's name and picture: a row keeps its own, and a first one takes the directory's.
async function remember(ctx: MutationContext, { workspace, user }: SignedIn, existing: Doc<"users"> | null, directory: { name?: string; image?: string }) {
  const display = existing === null ? Object.fromEntries(Object.entries(directory).filter(([, value]) => value !== undefined)) : displayFieldsIn(existing);
  const profile = { id: `${workspace}/${user}`, chatWorkspace: workspace, chatUser: user, ...display };
  await rememberSignedInMember(ctx, { existingUserId: existing?._id ?? null, profile });
}
