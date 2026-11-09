// What a domain hands the service: every domain folder has one registration module, which only its stack fills, and
// the service's one registry (registry.ts) merges them. A name or kind registered twice stops the service at boot.
import type { Hono } from "hono";
import { subscribersOf, type Subscribers, type Subscription } from "./bus/publish.ts";
import { jobRegistry, type Job, type JobRegistry } from "./jobs/define.ts";
import type { SlackHandlers } from "./slack/frontDoor.ts";

export interface Registration {
  /** Jobs the worker runs by name; a cron's job is named by its cron ID. */
  jobs?: Job[];
  /** Bus subscribers; their jobs join the worker's jobs. */
  subscribers?: Subscription<any>[];
  /** Slack handlers by kind, which the front door dispatches to. */
  slack?: SlackHandlers;
  /** Website routes, mounted at the root behind the app's gate. */
  routes?: Hono;
}

export interface Registry {
  jobs: JobRegistry;
  subscribers: Subscribers;
  slack: SlackHandlers;
  routes: Hono[];
}

/** Merges the registrations, by domain name for the errors. */
export function createRegistry(registrations: Record<string, Registration>): Registry {
  const all = Object.values(registrations);
  const subscriptions = all.flatMap((registration) => registration.subscribers ?? []);
  // A subscriber's job may be registered as a job as well; the same job once.
  const jobs = new Set([...all.flatMap((registration) => registration.jobs ?? []), ...subscriptions.map(({ job }) => job)]);
  const slack: Required<SlackHandlers> = { events: {}, clicks: {}, options: {}, commands: {} };
  const owners = new Map<string, string>();
  for (const [domain, registration] of Object.entries(registrations)) {
    for (const section of ["events", "clicks", "options", "commands"] as const) {
      for (const [kind, handler] of Object.entries(registration.slack?.[section] ?? {})) {
        const key = `${section} ${kind}`;
        const owner = owners.get(key);
        if (owner !== undefined) throw new Error(`Both ${owner} and ${domain} register the Slack ${key}`);
        owners.set(key, domain);
        (slack[section] as Record<string, unknown>)[kind] = handler;
      }
    }
  }
  return {
    jobs: jobRegistry([...jobs]),
    subscribers: subscribersOf(subscriptions),
    slack,
    routes: all.flatMap((registration) => (registration.routes ? [registration.routes] : [])),
  };
}
