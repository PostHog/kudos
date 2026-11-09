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

// What Slack fills in for a field a manifest leaves out, so holding it is the same as not holding the field.
const empty = (value: unknown): boolean => value === undefined || value === null || value === false || value === "" || (Array.isArray(value) && value.length === 0) || (isObject(value) && Object.values(value).every(empty));

// Whether `held` is what `wanted` sets, whatever its key order and whatever empty defaults Slack adds beside it.
function holds(held: unknown, wanted: unknown): boolean {
  if (isObject(wanted)) return isObject(held) && Object.entries(wanted).every(([key, value]) => holds(held[key], value)) && Object.entries(held).every(([key, value]) => key in wanted || empty(value));
  if (Array.isArray(wanted)) return Array.isArray(held) && sameList(held, wanted);
  return held === wanted;
}

// Slack may hand a list back in another order: a list is the same when each wanted entry pairs with its own held one.
function sameList(held: unknown[], wanted: unknown[]) {
  if (held.length !== wanted.length) return false;
  const left = [...held];
  return wanted.every((entry) => {
    const index = left.findIndex((candidate) => holds(candidate, entry));
    return index >= 0 && left.splice(index, 1).length === 1;
  });
}

// Slack's own bookkeeping in an export, which no manifest sends.
const slacks = new Set(["_metadata"]);

/**
 * Where `next` differs from `current`: what it sets differently, and what Slack holds that it leaves out, which an
 * update removes since it replaces the whole manifest. The empty defaults Slack fills in, and its `_metadata`, don't count.
 */
export function changesBetween(current: unknown, next: Manifest, prefix = ""): Change[] {
  const path = (key: string) => (prefix === "" ? key : `${prefix}.${key}`);
  const set = Object.entries(next).flatMap(([key, to]) => {
    const from = isObject(current) ? current[key] : undefined;
    if (isObject(to)) return changesBetween(from, to, path(key));
    return holds(from, to) ? [] : [{ path: path(key), from, to }];
  });
  const left = isObject(current) ? Object.entries(current).filter(([key, from]) => !(key in next) && !empty(from) && !(prefix === "" && slacks.has(key))) : [];
  return [...set, ...left.map(([key, from]) => ({ path: path(key), from, to: undefined }))];
}

function at(manifest: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), manifest);
}

// The lists whose entries a running app relies on, of every kind Slack holds: dropping one is a change of its own,
// made in its own step after the app stops using it, and adding a scope is what a reinstall approves.
function guarded(current: unknown, next: unknown) {
  const scopes = new Set([...Object.keys((at(current, "oauth_config.scopes") as object | undefined) ?? {}), ...Object.keys((at(next, "oauth_config.scopes") as object | undefined) ?? {})]);
  const events = new Set([...Object.keys((at(current, "settings.event_subscriptions") as object | undefined) ?? {}), ...Object.keys((at(next, "settings.event_subscriptions") as object | undefined) ?? {})].filter((key) => key.endsWith("_events")));
  return [...[...scopes].sort().map((kind) => `oauth_config.scopes.${kind}`), ...[...events].sort().map((kind) => `settings.event_subscriptions.${kind}`)];
}

const entriesOf = (manifest: unknown, path: string) => {
  const value = at(manifest, path);
  return Array.isArray(value) ? value : [];
};

const missing = (from: unknown, to: unknown, paths: string[]) => paths.flatMap((path) => entriesOf(from, path).filter((entry) => !entriesOf(to, path).includes(entry)).map((entry) => `${path} ${String(entry)}`));

export type ManifestUpdate = { outcome: "current" | "planned" | "updated"; changes: Change[]; scopesAdded: string[]; permissionsUpdated?: boolean };

/**
 * Moves the app to `manifest`: reads what Slack holds, refuses to drop a scope or an event of any kind, has Slack validate it,
 * checks that a new events URL answers Slack's URL check, and, with `apply`, sends it and reads back what Slack kept.
 */
export async function updateManifest({ api, manifest, apply, answersSlack }: { api: ManifestApi; manifest: Manifest; apply: boolean; answersSlack: (url: string) => Promise<boolean> }): Promise<ManifestUpdate> {
  const current = await api.export();
  const lists = guarded(current, manifest);
  const removed = missing(current, manifest, lists);
  if (removed.length > 0) throw new Error(`the manifest is not sent, since it would remove ${removed.join(", ")}: remove those in a step of their own, after the running app stops using them`);
  const changes = changesBetween(current, manifest);
  const scopesAdded = missing(manifest, current, lists.filter((path) => path.startsWith("oauth_config.scopes.")));
  if (changes.length === 0) return { outcome: "current", changes, scopesAdded };
  const errors = await api.validate(manifest);
  if (errors.length > 0) throw new Error(`Slack refuses the manifest: ${errors.join("; ")}`);
  const eventsUrl = "settings.event_subscriptions.request_url";
  if (changes.some(({ path }) => path === eventsUrl) && !(await answersSlack(String(at(manifest, eventsUrl))))) throw new Error(`the manifest is not sent, since ${String(at(manifest, eventsUrl))} doesn't answer Slack's URL check`);
  if (!apply) return { outcome: "planned", changes, scopesAdded };
  const { permissionsUpdated } = await api.update(manifest);
  const differs = changesBetween(await api.export(), manifest);
  if (differs.length > 0) throw new Error(`Slack kept a manifest that differs at ${differs.map(({ path }) => path).join(", ")}`);
  return { outcome: "updated", changes, scopesAdded, permissionsUpdated };
}
