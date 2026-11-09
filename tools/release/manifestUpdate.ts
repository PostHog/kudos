// Moving a Slack app to a new manifest through Slack's manifest API (`apps.manifest.export`, `.validate`, `.update`),
// so nobody pastes it by hand. Slack's side comes in as functions, so the rules are proven on a fake; `slackManifest.ts`
// wires them to Slack.

export type Manifest = Record<string, unknown>;

export type ManifestApi = {
  export: () => Promise<Manifest>;
  /** Slack's objections to the manifest, empty when it accepts it. */
  validate: (manifest: Manifest) => Promise<string[]>;
  update: (manifest: Manifest) => Promise<{ permissionsUpdated: boolean }>;
};

export type Change = { path: string; from: unknown; to: unknown };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Slack may hand a list back in another order; a list counts as the same when it holds the same entries.
const sameList = (from: unknown, to: unknown[]) => Array.isArray(from) && from.length === to.length && JSON.stringify(from.map((entry) => JSON.stringify(entry)).sort()) === JSON.stringify(to.map((entry) => JSON.stringify(entry)).sort());

/** Where `next` differs from `current`, reading only what `next` sets, so the fields Slack adds of its own don't count. */
export function changesBetween(current: unknown, next: Manifest, prefix = ""): Change[] {
  return Object.entries(next).flatMap(([key, to]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    const from = isObject(current) ? current[key] : undefined;
    if (isObject(to)) return changesBetween(from, to, path);
    const same = Array.isArray(to) ? sameList(from, to) : from === to;
    return same ? [] : [{ path, from, to }];
  });
}

// The lists whose entries a running app relies on: dropping one is a change of its own, made in its own step.
const kept = ["oauth_config.scopes.bot", "oauth_config.scopes.user", "settings.event_subscriptions.bot_events"];

function at(manifest: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), manifest);
}

function removals(current: Manifest, next: Manifest) {
  return kept.flatMap((path) => {
    const after = new Set((at(next, path) as unknown[] | undefined) ?? []);
    return ((at(current, path) as unknown[] | undefined) ?? []).filter((entry) => !after.has(entry)).map((entry) => `${path} ${String(entry)}`);
  });
}

export type ManifestUpdate = { outcome: "current" | "planned" | "updated"; changes: Change[]; permissionsUpdated?: boolean };

/**
 * Moves the app to `manifest`: reads what Slack holds, refuses to drop a scope or an event, has Slack validate it,
 * checks that a new events URL answers Slack's URL check, and, with `apply`, sends it and reads back what Slack kept.
 */
export async function updateManifest({ api, manifest, apply, answersSlack }: { api: ManifestApi; manifest: Manifest; apply: boolean; answersSlack: (url: string) => Promise<boolean> }): Promise<ManifestUpdate> {
  const current = await api.export();
  const changes = changesBetween(current, manifest);
  if (changes.length === 0) return { outcome: "current", changes };
  const removed = removals(current, manifest);
  if (removed.length > 0) throw new Error(`the manifest is not sent, since it would remove ${removed.join(", ")}: remove those in a step of their own, after the running app stops using them`);
  const errors = await api.validate(manifest);
  if (errors.length > 0) throw new Error(`Slack refuses the manifest: ${errors.join("; ")}`);
  const eventsUrl = "settings.event_subscriptions.request_url";
  if (changes.some(({ path }) => path === eventsUrl) && !(await answersSlack(String(at(manifest, eventsUrl))))) throw new Error(`the manifest is not sent, since ${String(at(manifest, eventsUrl))} doesn't answer Slack's URL check`);
  if (!apply) return { outcome: "planned", changes };
  const { permissionsUpdated } = await api.update(manifest);
  const differs = changesBetween(await api.export(), manifest);
  if (differs.length > 0) throw new Error(`Slack kept a manifest that differs at ${differs.map(({ path }) => path).join(", ")}`);
  return { outcome: "updated", changes, permissionsUpdated };
}
