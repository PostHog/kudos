// SW11: one function builds every website link. Today's convex/website/link.test.ts, on the service's test backend.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { websiteLinkOf } from "./link.ts";
import { signInEntry, urlOf, type Page } from "./routes.ts";
import type { VisitSource } from "./visitSource.ts";

const siteUrl = "https://kudos-site.test";
const backend = useTestBackend({ workspace: "T1" });

beforeEach(() => {
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("SITE_URL", siteUrl);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
});

afterEach(() => void vi.unstubAllEnvs());

// Today's `prepareWebsiteFlag` made the workspace's key before a link was built; its body is `workspaceKeyOf`.
async function linkTo(page: Page, source: VisitSource = "reply") {
  const t = backend();
  await definitionsStored(t.operations, onForEveryone("website"));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
  return t.query((ctx) => websiteLinkOf(ctx, { workspace: "T1", page, source }));
}

describe("SW11: one function builds every website link", () => {
  test.each<{ page: Page; link: string }>([
    { page: { page: "home" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "leaderboard", period: "week" }, link: `${siteUrl}/leaderboard?src=reply` },
    { page: { page: "quests" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "skillTree" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "book" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "bookEarned" }, link: `${siteUrl}/book?src=reply#milestones` },
    { page: { page: "bookCollection" }, link: `${siteUrl}/book?src=reply#hoggies` },
    { page: { page: "settings" }, link: `${siteUrl}/settings?src=reply` },
    { page: { page: "levelUp", level: 3 }, link: `${siteUrl}/book?src=reply#level-up/3` },
  ])("AL67: $page.page links to SITE_URL plus the album address it lands on: $link", async ({ page, link }) => {
    expect(await linkTo(page)).toBe(link);
  });

  test.each<{ page: Page; link: string }>([
    { page: { page: "leaderboard", period: "month" }, link: `${siteUrl}/leaderboard?src=reply` },
    { page: { page: "leaderboard", period: "all" }, link: `${siteUrl}/leaderboard?src=reply` },
    { page: { page: "skillTree", perk: "spark" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "skillTree", crate: "skillTree" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "quests", quest: 2 }, link: `${siteUrl}/?src=reply` },
    { page: { page: "quests", crate: "quests" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "leaderboard", period: "week", crate: "leaderboard" }, link: `${siteUrl}/leaderboard?src=reply` },
    { page: { page: "leaderboard", period: "month", crate: "leaderboard" }, link: `${siteUrl}/leaderboard?src=reply` },
    { page: { page: "book", crate: "book" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "home", crate: "journey" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "home", panel: "inventory" }, link: `${siteUrl}/?src=reply` },
    { page: { page: "quests", crate: { kind: "weekly", week: "2026-10-05", slot: 2 } }, link: `${siteUrl}/?src=reply` },
    { page: { page: "bookCollection", crate: { kind: "bought", n: 2 } }, link: `${siteUrl}/book?src=reply#hoggies` },
    { page: { page: "bookCollection", crate: "store" }, link: `${siteUrl}/book?src=reply#hoggies` },
    { page: { page: "bookEarned", crate: "book" }, link: `${siteUrl}/book?src=reply#milestones` },
    { page: { page: "quests", crate: { kind: "group", week: "2026-10-05" } }, link: `${siteUrl}/?src=reply` },
  ])("AL67: a link carries no crate, quest, perk, panel or period, which the album has nowhere to land: $page → $link", async ({ page, link }) => {
    expect(await linkTo(page)).toBe(link);
  });

  test.each<VisitSource>(["welcome", "monday-dm", "recap", "app-home", "reply", "monday-post", "link-card"])("HH93: a link names the surface that sends it, and nothing about the member: %s", async (source) => {
    expect(await linkTo({ page: "bookEarned" }, source)).toBe(`${siteUrl}/book?src=${source}#milestones`);
  });

  test.each<{ page: Page; link: string }>([
    { page: { page: "settings", section: "visibility" }, link: `${siteUrl}/settings?section=visibility&src=reply` },
    { page: { page: "settings", section: "messages" }, link: `${siteUrl}/settings?section=messages&src=reply` },
    { page: { page: "settings", section: "group" }, link: `${siteUrl}/settings?section=group&src=reply` },
  ])("#531: a link to a settings section carries its target: $link", async ({ page, link }) => {
    expect(await linkTo(page)).toBe(link);
  });

  test.each<{ page: Page; link: string }>([
    { page: { page: "home" }, link: `${siteUrl}/sign-in/?src=reply` },
    { page: { page: "bookEarned" }, link: `${siteUrl}/sign-in/book?src=reply#milestones` },
    { page: { page: "settings", section: "messages" }, link: `${siteUrl}/sign-in/settings?section=messages&src=reply` },
  ])("AL67: on the sign-in entry a link is that entry plus the album address: $link", ({ page, link }) => {
    expect(urlOf(`${siteUrl}${signInEntry}`, page, "reply")).toBe(link);
  });
});
