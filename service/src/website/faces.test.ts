import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { memberDecision } from "../analytics/flags.ts";
import { createClock } from "../clock.ts";
import { normalisedName } from "../companyProfiles/faces.ts";
import { teamPagesFlag } from "../companyProfiles/flag.ts";
import type { Id } from "../db/columns.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { useTestDatabase } from "../../testing/database.ts";
import type { FakePostHog } from "../../testing/fakePostHog.ts";
import { flagsFromPostHog, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { faceOf, storedFaceOf } from "./faces.ts";
import type { VerifiedMember } from "./memberQuery.ts";

const database = useTestDatabase();
const quiet: Log = { info() {}, error() {} };
const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => Date.parse("2026-11-10T10:00:00Z") }), log: quiet, retryDelayMs: () => 1 });
const seed = seeder(operations);

let postHog: FakePostHog;

beforeEach(() => {
  postHog = postHogDeciding("sandbox");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const picture = "https://avatars.example.com/juno.png";
const companyPicture = "https://people.example.com/juno.jpg";

/** A signed-in member, decided once in a mutation so the team-pages flag answers for them in a query. */
async function signedIn(teamPages: boolean, names: Partial<VerifiedMember> = { name: "Juno Whitlock" }): Promise<VerifiedMember> {
  await flagsFromPostHog(operations, postHog, (teamPages ? onForEveryone : offForEveryone)(teamPagesFlag.key));
  const member = await seed.insert("members", { workspace: "T1", user: "U_JUNO", kind: "member", ...(names.name === undefined ? {} : { realName: names.name }) });
  await operations.mutation("test.analyticsId", (ctx) => memberDecision(ctx, teamPagesFlag, member));
  return { member, workspace: "T1", user: "U_JUNO", ...names };
}

let profiles = 0;

function aCompanyProfile(firstName: string, lastName: string, image: string | null) {
  profiles += 1;
  return seed.insert("companyProfiles", { profile: profiles, firstName, lastName, normalisedName: normalisedName(`${firstName} ${lastName}`), ...(image === null ? {} : { image }), colour: "#f4b400" });
}

function aStoredFace(member: Id<"members">, face: { image: string; colour: string } | null) {
  return seed.insert("companyFaces", { workspace: "T1", member, face });
}

const stored = (me: VerifiedMember) => operations.query("test.storedFaceOf", (ctx) => storedFaceOf(ctx, me));
const live = (me: VerifiedMember) => operations.query("test.faceOf", (ctx) => faceOf(ctx, me));

describe("before team pages, a member's face is the company profile their real name matches, else their sign-in face", () => {
  test("one company profile with a picture under the member's name gives its picture and colour, with the member's initials", async () => {
    const me = await signedIn(false, { name: "Juno Whitlock", image: picture });
    await aCompanyProfile("Juno", "Whitlock", companyPicture);

    expect(await stored(me)).toEqual({ kind: "company-profile", image: companyPicture, colour: "#f4b400", initials: "JW" });
    expect(await live(me), "faceOf answers the same before team pages").toEqual({ kind: "company-profile", image: companyPicture, colour: "#f4b400", initials: "JW" });
  });

  test("two profiles under one name match neither, so the Slack picture shows", async () => {
    const me = await signedIn(false, { name: "Juno Whitlock", image: picture });
    await aCompanyProfile("Juno", "Whitlock", companyPicture);
    await aCompanyProfile("Juno", "Whitlock", "https://people.example.com/other.jpg");

    expect(await stored(me)).toEqual({ kind: "slack", image: picture, initials: "JW" });
  });

  test("the given and family names stand in for a missing name, so the profile under them gives the face", async () => {
    const me = await signedIn(false, { givenName: "Émile", familyName: "Okonkwo" });
    await aCompanyProfile("Emile", "Okonkwo", companyPicture);

    expect(await stored(me)).toEqual({ kind: "company-profile", image: companyPicture, colour: "#f4b400", initials: "ÉO" });
  });

  test("a matching profile without a picture is no face, so the initials show", async () => {
    const me = await signedIn(false, { givenName: "Émile", familyName: "Okonkwo" });
    await aCompanyProfile("Emile", "Okonkwo", null);

    expect(await stored(me)).toEqual({ kind: "initials", initials: "ÉO" });
  });

  test("a member with no name at all shows a question mark", async () => {
    const me = await signedIn(false, {});

    expect(await stored(me)).toEqual({ kind: "initials", initials: "?" });
  });
});

describe("with team pages, the face kept for the member wins over their name", () => {
  test("a kept company face shows, though no profile carries the member's name", async () => {
    const me = await signedIn(true, { name: "Juno Whitlock", image: picture });
    await aStoredFace(me.member, { image: companyPicture, colour: "#0f9d58" });

    expect(await stored(me)).toEqual({ kind: "company-profile", image: companyPicture, colour: "#0f9d58", initials: "JW" });
    expect(await live(me)).toEqual({ kind: "company-profile", image: companyPicture, colour: "#0f9d58", initials: "JW" });
  });

  test("a match kept without a picture shows the sign-in face, and never the profile under the member's name", async () => {
    const me = await signedIn(true, { name: "Juno Whitlock", image: picture });
    await aCompanyProfile("Juno", "Whitlock", companyPicture);
    await aStoredFace(me.member, null);

    expect(await stored(me)).toEqual({ kind: "slack", image: picture, initials: "JW" });
    expect(await live(me)).toEqual({ kind: "slack", image: picture, initials: "JW" });
  });

  test("with nothing kept, storedFaceOf shows the sign-in face without matching", async () => {
    const me = await signedIn(true, { name: "Juno Whitlock", image: picture });
    await aCompanyProfile("Juno", "Whitlock", companyPicture);

    expect(await stored(me)).toEqual({ kind: "slack", image: picture, initials: "JW" });
  });

  test("with nothing kept, faceOf matches the member's company profile live, by the name the directory holds", async () => {
    const me = await signedIn(true, { name: "Juno Whitlock", image: picture });
    await aCompanyProfile("Juno", "Whitlock", companyPicture);

    expect(await live(me)).toEqual({ kind: "company-profile", image: companyPicture, colour: "#f4b400", initials: "JW" });
  });
});
