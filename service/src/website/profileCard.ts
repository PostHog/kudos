// The module map's skeleton of convex/website/profileCard.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type AvatarShown } from "../album/hoggies/avatar.ts";
import { type ProfileCard } from "../profileCard/profileCard.ts";

export type ProfileCardAnswer = { kind: "not-found" } | ({ kind: "card"; group: string | null } & ProfileCard & AvatarShown);
