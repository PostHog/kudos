// The profile, settings, store and App Home routes through the whole app: the website's code calls each by its former
// Convex name, and the transport refuses arguments outside its shape before any handler runs. A check that denies
// answers every request it reaches, so reaching a route proves its name and kind without running its handler.
import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../../testing/database.ts";
import { createClock } from "../../clock.ts";
import { createApp } from "../../http/app.ts";
import { jsonLog } from "../../log.ts";
import { createOperations } from "../../operations.ts";
import { getBrowserAnalytics } from "../browserAnalytics.ts";
import { findSlackEmojis, getAppEmojis, mapMyEmoji } from "../emojiWizard.ts";
import { arrive } from "../lastVisit.ts";
import type { Denial } from "../memberQuery.ts";
import { closeHowItWorks } from "../onboarding.ts";
import { getPlayerCard, getPlayerCardEmojis } from "../playerCard.ts";
import { getMyProfile } from "../profile.ts";
import { getProfileCard } from "../profileCard.ts";
import { getQuests, viewQuests } from "../quests.ts";
import { getSettings } from "../settings.ts";
import { pickPrimaryGroup, pickWeeklyPostChannel, setAvatar, setBoardVisibility, setMessageSetting, setPublicCelebrations, setWeeklyPost } from "../settingsCommands.ts";
import { getSkillTree } from "../skillTree.ts";
import { buyCrate, buyItem, buyPerk } from "../storeCommands.ts";
import { endXpMoment, getXpMoment } from "../xpMoment.ts";
import { profileRoutes } from "./profileRoutes.ts";
import { websiteRoutes } from "./table.ts";
import { apiHeader, apiTransport, type MemberCheck } from "./transport.ts";

const database = useTestDatabase();
const clock = createClock();
const operations = createOperations({ pool: database.pool, clock, log: jsonLog(() => {}) });

const closed: Denial = { kind: "closed" };

/** The app with the website's real route table, behind a check that answers closed to everyone. */
function websiteClosed() {
  const log = jsonLog(() => {});
  const check: MemberCheck = { read: async () => closed, command: async () => closed };
  const identify = async () => ({ workspace: "T1", user: "U_JUNO", name: "Juno Whitlock" });
  const app = createApp({ commit: "0123abc", readiness: { migrations: () => "done" }, off: false, log, clock, routes: [apiTransport({ operations, log, routes: websiteRoutes, identify, check })] });
  return (kind: "query" | "mutation", name: string, args: unknown) => app.request(`/api/${kind}/${name}`, { method: "POST", headers: { "content-type": "application/json", [apiHeader]: "1" }, body: JSON.stringify(args) });
}

const request = "0d6f2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f";

// Each route with its kind, its handler, arguments its shape takes, and one field its shape doesn't name.
const routes: Array<{ name: string; kind: "query" | "mutation"; handler: unknown; args: Record<string, unknown>; misfit: string }> = [
  { name: "website.profile.getMyProfile", kind: "query", handler: getMyProfile, args: {}, misfit: "user" },
  { name: "website.profileCard.getProfileCard", kind: "query", handler: getProfileCard, args: {}, misfit: "user" },
  { name: "website.playerCard.getPlayerCard", kind: "query", handler: getPlayerCard, args: { person: "m_somebody" }, misfit: "member" },
  { name: "website.playerCard.getPlayerCardEmojis", kind: "query", handler: getPlayerCardEmojis, args: { person: "m_somebody" }, misfit: "member" },
  { name: "website.settings.getSettings", kind: "query", handler: getSettings, args: {}, misfit: "member" },
  { name: "website.skillTree.getSkillTree", kind: "query", handler: getSkillTree, args: {}, misfit: "user" },
  { name: "website.emojiWizard.findSlackEmojis", kind: "query", handler: findSlackEmojis, args: { near: "shipit", search: "ship" }, misfit: "workspace" },
  { name: "website.emojiWizard.getAppEmojis", kind: "query", handler: getAppEmojis, args: {}, misfit: "workspace" },
  { name: "website.emojiWizard.mapMyEmoji", kind: "mutation", handler: mapMyEmoji, args: { emoji: "custom:shipit", to: "shipit" }, misfit: "member" },
  { name: "website.onboarding.closeHowItWorks", kind: "mutation", handler: closeHowItWorks, args: { triedSlack: true }, misfit: "member" },
  { name: "website.quests.getQuests", kind: "query", handler: getQuests, args: {}, misfit: "user" },
  { name: "website.quests.viewQuests", kind: "mutation", handler: viewQuests, args: { surface: "panel" }, misfit: "member" },
  { name: "website.lastVisit.arrive", kind: "mutation", handler: arrive, args: { from: null }, misfit: "member" },
  { name: "website.xpMoment.getXpMoment", kind: "query", handler: getXpMoment, args: {}, misfit: "member" },
  { name: "website.xpMoment.endXpMoment", kind: "mutation", handler: endXpMoment, args: { from: 1, until: 2, skipped: false }, misfit: "member" },
  { name: "website.browserAnalytics.getBrowserAnalytics", kind: "query", handler: getBrowserAnalytics, args: {}, misfit: "member" },
  { name: "website.commands.buyPerk", kind: "mutation", handler: buyPerk, args: { perk: "spark", request }, misfit: "member" },
  { name: "website.commands.buyItem", kind: "mutation", handler: buyItem, args: { item: "custom:shipit", request }, misfit: "member" },
  { name: "website.commands.buyCrate", kind: "mutation", handler: buyCrate, args: { next: 1 }, misfit: "member" },
  { name: "website.commands.setBoardVisibility", kind: "mutation", handler: setBoardVisibility, args: { visible: false }, misfit: "member" },
  { name: "website.commands.setAvatar", kind: "mutation", handler: setAvatar, args: { hoggie: "rocket" }, misfit: "member" },
  { name: "website.commands.setMessageSetting", kind: "mutation", handler: setMessageSetting, args: { kind: "kudos-reply", place: "dm" }, misfit: "member" },
  { name: "website.commands.setWeeklyPost", kind: "mutation", handler: setWeeklyPost, args: { on: true }, misfit: "member" },
  { name: "website.commands.setPublicCelebrations", kind: "mutation", handler: setPublicCelebrations, args: { on: false }, misfit: "member" },
  { name: "website.commands.pickWeeklyPostChannel", kind: "mutation", handler: pickWeeklyPostChannel, args: { link: "https://t1.slack.com/archives/C_GENERAL" }, misfit: "workspace" },
  { name: "website.commands.pickPrimaryGroup", kind: "mutation", handler: pickPrimaryGroup, args: { group: "S_ANTS" }, misfit: "member" },
];

describe("the profile, settings, store and App Home routes, by their former Convex names", () => {
  test("are S17's list, each bound to its port as it is, in the website's route table", () => {
    expect(profileRoutes.map(({ name, kind, handler }) => [name, kind, handler])).toEqual(routes.map(({ name, kind, handler }) => [name, kind, handler]));
    const names = routes.map(({ name }) => name);
    expect(websiteRoutes.filter(({ name }) => names.includes(name)).map(({ name }) => name)).toEqual(names);
  });

  test("are each reachable through the app by its name and kind, and by no other kind", async () => {
    const send = websiteClosed();

    for (const { name, kind, args } of routes) {
      const answer = await send(kind, name, args);
      expect(answer.status, name).toBe(200);
      expect(await answer.json(), name).toEqual(closed);
      const otherKind = await send(kind === "query" ? "mutation" : "query", name, args);
      expect(otherKind.status, `${name} as the other kind`).toBe(404);
    }
  });

  test("refuse a field outside their shape before any handler runs", async () => {
    const send = websiteClosed();

    for (const { name, kind, args, misfit } of routes) {
      const answer = await send(kind, name, { ...args, [misfit]: "U_ROWAN" });
      expect(answer.status, `${name} with ${misfit}`).toBe(400);
      expect(await answer.json(), `${name} with ${misfit}`).toEqual({ error: "the arguments don't fit the route" });
    }
  });
});
