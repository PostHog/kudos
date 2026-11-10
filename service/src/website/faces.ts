// The module map's skeleton of convex/website/faces.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { CompanyFace } from "../companyProfiles/faces.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Face =
  | { kind: "company-profile"; image: string; colour: string; initials: string }
  | { kind: "slack"; image: string; initials: string }
  | { kind: "initials"; initials: string };

export async function faceOf(ctx: QueryContext, me: VerifiedMember): Promise<Face> {
  throw notPorted("website.faces.faceOf");
}

export async function storedFaceOf(ctx: QueryContext, me: VerifiedMember): Promise<Face> {
  throw notPorted("website.faces.storedFaceOf");
}

export function signInFaceOf(me: VerifiedMember): Face {
  const initials = initialsOf(me);
  if (me.image !== undefined) return { kind: "slack", image: me.image, initials };
  return { kind: "initials", initials };
}

export const nameless = "A teammate";

export function teammateOf(name: string | undefined, picture: string | null) {
  return { name: name ?? nameless, face: teammateFaceOf(name, picture) };
}

export function companyTeammateOf(name: string | undefined, picture: string | null, company: CompanyFace | null) {
  const teammate = teammateOf(name, picture);
  return company === null ? teammate : { ...teammate, face: { kind: "company-profile" as const, ...company, initials: teammate.face.initials } };
}

function teammateFaceOf(name: string | undefined, picture: string | null): Face {
  const initials = initialsOf({ name });
  if (picture !== null) return { kind: "slack", image: picture, initials };
  return { kind: "initials", initials };
}

type Names = { name?: string; givenName?: string; familyName?: string };

function initialsOf({ name, givenName, familyName }: Names) {
  const words = givenName !== undefined && familyName !== undefined ? [givenName, familyName] : (name ?? "").split(/\s+/);
  const initials = words
    .map(firstLetterOf)
    .filter((letter) => letter !== undefined)
    .slice(0, 2)
    .join("");
  return initials === "" ? "?" : initials;
}

function firstLetterOf(word: string) {
  return word.match(/\p{L}/u)?.[0]?.toUpperCase();
}
