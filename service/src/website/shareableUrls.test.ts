// getAlbum says shareable URLs are on only for a member shareable-urls is on for. Today's
// convex/website/shareableUrls.test.ts, on the service's test backend. getAlbum is S16's website handler.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { flagsFromPostHog, onForEmails, onForEveryone } from "../../testing/flags.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { MemberId } from "../workspace/directory.ts";
import { getAlbum } from "./album.ts";
import type { VerifiedMember } from "./memberQuery.ts";

const now = new Date("2026-10-21T10:00:00Z");
const ann = { user: "U_ANN", name: "Ann Quill", email: "ann@example.com" };
const bea = { user: "U_BEA", name: "Bea Marsh", email: "bea@example.com" };

type Person = typeof ann;

const backend = useTestBackend({ now: now.getTime(), workspace: "T1" });

let t: TestBackend;

beforeEach(async () => {
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  t = backend();
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10 });
  await aTeammate(ann);
  await aTeammate(bea);
});

afterEach(() => void vi.unstubAllEnvs());

describe("getAlbum says shareable URLs are on only for a member shareable-urls is on for", () => {
  waitsOn(["S16"], "with shareable-urls on, getAlbum answers shareableUrls", async () => {
    await serving(onForEveryone("album"), onForEveryone("shareable-urls"));

    expect(await albumOf(ann)).toHaveProperty("shareableUrls", true);
  }, 60_000);

  waitsOn(["S16"], "with shareable-urls off, getAlbum answers as before, without shareableUrls", async () => {
    await serving(onForEveryone("album"));

    expect(await albumOf(ann)).not.toHaveProperty("shareableUrls");
  }, 60_000);

  waitsOn(["S16"], "shareable-urls is decided for each member who reads", async () => {
    await serving(onForEveryone("album"), onForEmails("shareable-urls", bea.email));

    expect(await albumOf(ann)).not.toHaveProperty("shareableUrls");
    expect(await albumOf(bea)).toHaveProperty("shareableUrls", true);
  }, 60_000);
});

// Today's `prepareWebsiteFlag` made the workspace's key after the flags loaded; its body is `workspaceKeyOf`.
async function serving(...definitions: FlagDefinition[]) {
  await flagsFromPostHog(t.operations, t.postHog, onForEveryone("website"), ...definitions);
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

async function albumOf(person: Person) {
  const me = await meOf(person);
  const album = await t.query((ctx) => getAlbum(ctx, me));
  if (album.kind !== "album") throw new Error(`getAlbum answered ${album.kind}`);
  return album;
}

// The members row a `team_join` with this profile writes, as today's test joined each teammate.
async function aTeammate({ user, name, email }: Person) {
  await t.seed.insert("members", { workspace: "T1", user, kind: "member", asOf: 0, name, displayName: name, email });
}

// A signed-in reader, as today's `aSignedInSession` left them: the member check's answer, and the analytics ID their
// sign-in made, which the flags decide them by.
async function meOf({ user, name }: Person): Promise<VerifiedMember> {
  const row = (await t.seed.all("members")).find((member) => member.workspace === "T1" && member.user === user);
  if (row === undefined) throw new Error(`${user} is no member`);
  const member = row._id as MemberId;
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, workspace: "T1", user, name };
}
