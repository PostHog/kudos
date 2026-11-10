// The website's own profile card: the card the profile card command shows, for the signed-in member, with their group
// and avatar. Today's convex/website/profileCard.ts; its member query is a handler the route table runs once the member
// check has passed.
import { avatarShownOn, type AvatarShown } from "../album/hoggies/avatar.ts";
import { groupNameOnCard, profileCardOf, type ProfileCard } from "../profileCard/profileCard.ts";
import { profileCardOpenTo } from "../profileCard/flag.ts";
import type { QueryContext } from "../operations.ts";
import type { VerifiedMember } from "./memberQuery.ts";

export type ProfileCardAnswer = { kind: "not-found" } | ({ kind: "card"; group: string | null } & ProfileCard & AvatarShown);

export async function getProfileCard(ctx: QueryContext, me: VerifiedMember): Promise<ProfileCardAnswer> {
  if (!(await profileCardOpenTo(ctx, me.member))) return { kind: "not-found" };
  const card = await profileCardOf(ctx, me.member, { own: true, viewer: me.member });
  return { kind: "card", ...card, group: await groupNameOnCard(ctx, me.member, me.member), ...(await avatarShownOn(ctx, me.member, me.member)) };
}
