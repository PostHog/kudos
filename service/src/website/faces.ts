// The faces the website shows: a member's own, from their company profile, Slack picture or initials, and a teammate's.
// Today's convex/website/faces.ts over the service's transaction.
import { companyFaceOf, type CompanyFace } from "../companyProfiles/faces.ts";
import { teamPagesShownTo } from "../companyProfiles/flag.ts";
import { companyProfileOf } from "../companyProfiles/matcher.ts";
import { storedCompanyFaceOf } from "../companyProfiles/storedFaces.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";

export type Face =
  | { kind: "company-profile"; image: string; colour: string; initials: string }
  | { kind: "slack"; image: string; initials: string }
  | { kind: "initials"; initials: string };

export async function faceOf(ctx: QueryContext, me: VerifiedMember): Promise<Face> {
  return faceFrom(me, await ownCompanyFaceOf(ctx, me));
}

export async function storedFaceOf(ctx: QueryContext, me: VerifiedMember): Promise<Face> {
  return faceFrom(me, await ownStoredCompanyFaceOf(ctx, me));
}

function faceFrom(me: VerifiedMember, companyFace: CompanyFace | undefined): Face {
  if (companyFace !== undefined) return { kind: "company-profile", ...companyFace, initials: initialsOf(me) };
  return signInFaceOf(me);
}

export function signInFaceOf(me: VerifiedMember): Face {
  const initials = initialsOf(me);
  if (me.image !== undefined) return { kind: "slack", image: me.image, initials };
  return { kind: "initials", initials };
}

async function ownStoredCompanyFaceOf(ctx: QueryContext, me: VerifiedMember): Promise<CompanyFace | undefined> {
  if (!(await teamPagesShownTo(ctx, me.member))) return companyFaceOf(ctx, realNameOf(me));
  return (await storedCompanyFaceOf(ctx, me.workspace, me.member)) ?? undefined;
}

async function ownCompanyFaceOf(ctx: QueryContext, me: VerifiedMember): Promise<CompanyFace | undefined> {
  if (!(await teamPagesShownTo(ctx, me.member))) return companyFaceOf(ctx, realNameOf(me));
  const stored = await storedCompanyFaceOf(ctx, me.workspace, me.member);
  if (stored !== undefined) return stored ?? undefined;
  const profile = (await companyProfileOf(ctx, me.member))?.profile;
  return profile?.image === undefined ? undefined : { image: profile.image, colour: profile.colour };
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

function realNameOf({ name, givenName, familyName }: Names) {
  return name ?? [givenName, familyName].filter((part) => part !== undefined).join(" ");
}

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
