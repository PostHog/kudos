// The module map's skeleton of convex/album/hoggies/avatar.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../../workspace/directory.ts";
import type { Rarity } from "./catalogue.ts";
import type { HoggieArt } from "./drops.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export type Avatar = { hoggie: string; name: string; rarity: Rarity; art: HoggieArt };

export type AvatarShown = { avatar?: Avatar | null };

export type AvatarChoice = { avatar: Avatar | null; held: Avatar[] };

export async function setAvatar(ctx: MutationContext, member: MemberId, hoggie: string | null): Promise<void> {
  throw notPorted("album.hoggies.avatar.setAvatar");
}

export async function avatarShownOn(ctx: QueryContext, viewer: MemberId, member: MemberId): Promise<AvatarShown> {
  throw notPorted("album.hoggies.avatar.avatarShownOn");
}

export async function avatarOf(ctx: QueryContext, member: MemberId): Promise<Avatar | null> {
  throw notPorted("album.hoggies.avatar.avatarOf");
}

export async function avatarChoiceOf(ctx: QueryContext, member: MemberId): Promise<AvatarChoice | null> {
  throw notPorted("album.hoggies.avatar.avatarChoiceOf");
}
