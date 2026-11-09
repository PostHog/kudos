// @vitest-environment node
import { describe, expect, test } from "vitest";
import { renderManifest } from "../../slack-app/manifest.ts";
import { changesBetween, updateManifest, type Manifest, type ManifestApi } from "./manifestUpdate.ts";

const oldHost = "https://old-host.example";
const newHost = "https://new-host.example";

// Slack's side, as its manifest API answers: what it holds, what it accepts, and what it was asked to do. Slack's export
// carries fields of its own and may order lists its own way.
function slackHolding(held: Manifest, { errors = [] as string[], permissionsUpdated = false, keeps = (asked: Manifest) => asked } = {}) {
  const calls: string[] = [];
  let current: Manifest = { ...held, _metadata: { major_version: 1 } };
  const api: ManifestApi = {
    export: async () => (calls.push("export"), structuredClone(current)),
    validate: async () => (calls.push("validate"), errors),
    update: async (asked) => {
      calls.push("update");
      current = keeps(structuredClone(asked));
      return { permissionsUpdated };
    },
  };
  return { api, calls };
}

const reversed = (manifest: Manifest): Manifest => {
  const copy = structuredClone(manifest) as ReturnType<typeof renderManifest>;
  copy.settings.event_subscriptions.bot_events.reverse();
  copy.oauth_config.scopes.bot.reverse();
  return copy;
};

const answers = (urls: string[]) => async (url: string) => (urls.push(url), true);

describe("updating a Slack app's manifest", () => {
  test("changes nothing when Slack already holds the manifest, whatever order its lists come in", async () => {
    const { api, calls } = slackHolding(reversed(renderManifest("sandbox", newHost)));

    await expect(updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: answers([]) })).resolves.toMatchObject({ outcome: "current", changes: [] });
    expect(calls).toEqual(["export"]);
  });

  test("moves the app to new request URLs once the new events URL answers Slack's check, and reads back what Slack kept", async () => {
    const { api, calls } = slackHolding(renderManifest("sandbox", oldHost));
    const asked: string[] = [];

    const result = await updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: answers(asked) });

    expect(result).toMatchObject({ outcome: "updated", permissionsUpdated: false });
    expect(result.changes.map(({ path }) => path)).toEqual([
      "features.slash_commands",
      "features.unfurl_domains",
      "oauth_config.redirect_urls",
      "settings.event_subscriptions.request_url",
      "settings.interactivity.request_url",
      "settings.interactivity.message_menu_options_url",
    ]);
    expect(asked).toEqual([`${newHost}/slack/events`]);
    expect(calls).toEqual(["export", "validate", "update", "export"]);
  });

  test("without apply, only plans: it reads, compares and validates, and changes nothing", async () => {
    const { api, calls } = slackHolding(renderManifest("sandbox", oldHost));

    await expect(updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: false, answersSlack: answers([]) })).resolves.toMatchObject({ outcome: "planned" });
    expect(calls).toEqual(["export", "validate"]);
  });

  test("never sends a manifest whose events URL doesn't answer Slack's check, which Slack would refuse or stop delivering to", async () => {
    const { api, calls } = slackHolding(renderManifest("sandbox", oldHost));

    await expect(updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: async () => false })).rejects.toThrow(`${newHost}/slack/events doesn't answer Slack's URL check`);
    expect(calls).not.toContain("update");
  });

  test("never removes a scope or an event the running app may use: that goes in a step of its own", async () => {
    const held = renderManifest("sandbox", newHost);
    held.oauth_config.scopes.bot.push("files:read");
    held.settings.event_subscriptions.bot_events.push("file_shared");
    const { api, calls } = slackHolding(held);

    await expect(updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: answers([]) })).rejects.toThrow("it would remove oauth_config.scopes.bot files:read, settings.event_subscriptions.bot_events file_shared");
    expect(calls).toEqual(["export"]);
  });

  test("never sends a manifest Slack's validation refuses", async () => {
    const { api, calls } = slackHolding(renderManifest("sandbox", oldHost), { errors: ["/settings/event_subscriptions/request_url: not reachable"] });

    await expect(updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: answers([]) })).rejects.toThrow("Slack refuses the manifest: /settings/event_subscriptions/request_url: not reachable");
    expect(calls).not.toContain("update");
  });

  test("says so when the change needs the app reinstalled", async () => {
    const { api } = slackHolding(renderManifest("sandbox", oldHost), { permissionsUpdated: true });

    await expect(updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: answers([]) })).resolves.toMatchObject({ outcome: "updated", permissionsUpdated: true });
  });

  test("fails when Slack kept something other than what it was sent", async () => {
    const { api } = slackHolding(renderManifest("sandbox", oldHost), { keeps: () => renderManifest("sandbox", oldHost) });

    await expect(updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: answers([]) })).rejects.toThrow("Slack kept a manifest that differs at features.slash_commands");
  });
});

describe("what Slack's export may hold that the repository's manifest doesn't", () => {
  test("a slash command Slack hands back with its keys in another order, or with a field of its own, is the same command", async () => {
    const rendered = renderManifest("sandbox", newHost);
    const held = { ...rendered, features: { ...rendered.features, slash_commands: rendered.features.slash_commands.map((command) => ({ ...Object.fromEntries(Object.entries(command).reverse()), usage_hint: "" })) } };
    const { api, calls } = slackHolding(held);

    await expect(updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: answers([]) })).resolves.toMatchObject({ outcome: "current", changes: [] });
    expect(calls).toEqual(["export"]);
  });

  test("never drops user events or a scope of any kind, which an update would remove since it replaces the whole manifest", async () => {
    const held = renderManifest("sandbox", oldHost) as Manifest & { settings: { event_subscriptions: Record<string, unknown> }; oauth_config: { scopes: Record<string, unknown> } };
    held.settings.event_subscriptions.user_events = ["reaction_added"];
    held.oauth_config.scopes.bot_optional = ["files:read"];
    const { api, calls } = slackHolding(held);

    await expect(updateManifest({ api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: answers([]) })).rejects.toThrow("it would remove oauth_config.scopes.bot_optional files:read, settings.event_subscriptions.user_events reaction_added");
    expect(calls).toEqual(["export"]);
  });

  test("a manifest that only leaves a field out is a change, never already applied: a protected list fails, anything else is reported as removed", async () => {
    const dropsScopes = renderManifest("sandbox", newHost) as Manifest & { oauth_config: Record<string, unknown> };
    delete (dropsScopes.oauth_config as { scopes: Record<string, unknown> }).scopes.user;
    await expect(updateManifest({ api: slackHolding(renderManifest("sandbox", newHost)).api, manifest: dropsScopes, apply: true, answersSlack: answers([]) })).rejects.toThrow("it would remove oauth_config.scopes.user openid, oauth_config.scopes.user profile");

    const dropsRedirects = renderManifest("sandbox", newHost) as Manifest & { oauth_config: Record<string, unknown> };
    delete dropsRedirects.oauth_config.redirect_urls;
    const result = await updateManifest({ api: slackHolding(renderManifest("sandbox", newHost)).api, manifest: dropsRedirects, apply: false, answersSlack: answers([]) });
    expect(result).toMatchObject({ outcome: "planned", changes: [{ path: "oauth_config.redirect_urls", from: [`${newHost}/api/auth/callback/slack`], to: undefined }] });
  });

  test("names the scopes a change adds, which are what a workspace admin approves by reinstalling", async () => {
    const wants = renderManifest("sandbox", newHost);
    wants.oauth_config.scopes.bot.push("files:read");

    await expect(updateManifest({ api: slackHolding(renderManifest("sandbox", newHost), { permissionsUpdated: true }).api, manifest: wants, apply: true, answersSlack: answers([]) })).resolves.toMatchObject({ outcome: "updated", permissionsUpdated: true, scopesAdded: ["oauth_config.scopes.bot files:read"] });
    await expect(updateManifest({ api: slackHolding(renderManifest("sandbox", oldHost), { permissionsUpdated: true }).api, manifest: renderManifest("sandbox", newHost), apply: true, answersSlack: answers([]) })).resolves.toMatchObject({ permissionsUpdated: true, scopesAdded: [] });
  });
});

describe("comparing manifests", () => {
  test("counts what Slack holds and the manifest leaves out, but not the empty defaults Slack fills in where it fills them", () => {
    const held = { settings: { is_hosted: false }, features: { slash_commands: [{ command: "/a", usage_hint: "" }] }, _metadata: { major_version: 1 } };
    expect(changesBetween(held, { settings: {}, features: { slash_commands: [{ command: "/a" }] } })).toEqual([]);
    expect(changesBetween({ a: { b: 1, extra: true } }, { a: { b: 1 } })).toEqual([{ path: "a.extra", from: true, to: undefined }]);
    // Anywhere else an empty value may be meant, as a schema's `additionalProperties: false`, so dropping it is a change.
    expect(changesBetween({ a: { b: 1, flag: false, hint: "" } }, { a: { b: 1 } })).toEqual([
      { path: "a.flag", from: false, to: undefined },
      { path: "a.hint", from: "", to: undefined },
    ]);
    expect(changesBetween({ settings: { is_hosted: true } }, { settings: {} })).toEqual([{ path: "settings.is_hosted", from: true, to: undefined }]);
    expect(changesBetween({ features: { slash_commands: [{ command: "/a", extra: false }] } }, { features: { slash_commands: [{ command: "/a" }] } })).toHaveLength(1);
    expect(changesBetween({ a: { b: 1 } }, { a: { b: 2 } })).toEqual([{ path: "a.b", from: 1, to: 2 }]);
    expect(changesBetween({}, { a: { b: [1] } })).toEqual([{ path: "a.b", from: undefined, to: [1] }]);
  });
});
