// The bus, as today's convex/bus/publish.ts: a domain event becomes one job per subscriber, written in the publishing
// mutation's transaction, so the subscribers run only when the event's own change commits. Each published event gets
// a fact, one ID every subscriber's job carries.
import { randomUUID } from "node:crypto";
import type { Job } from "../jobs/define.ts";
import type { Scheduler } from "../jobs/schedule.ts";

/** A domain event: its `type` picks the subscribers. The converted `bus/events` narrows it to the app's events. */
export interface DomainEvent {
  type: string;
}

/** The event as each subscriber's job receives it: with the fact that ties its jobs together. */
export type Published<Event extends DomainEvent> = Event & { fact: string };

export interface Subscription<Event extends DomainEvent = DomainEvent> {
  event: Event["type"];
  /** Runs once per published event, with `{ event }`; its name is the former Convex subscriber's path. */
  job: Job<unknown, { event: Published<Event> }>;
  /** When set, only the events it accepts schedule the job. */
  only?: (event: Published<Event>) => boolean;
}

/** Every subscription, by the event type it listens to, in registration order. */
export type Subscribers = ReadonlyMap<string, readonly Subscription[]>;

export function subscribersOf(subscriptions: readonly Subscription[]): Subscribers {
  const byType = new Map<string, Subscription[]>();
  for (const subscription of subscriptions) byType.set(subscription.event, [...(byType.get(subscription.event) ?? []), subscription]);
  return byType;
}

export async function publish(jobs: Scheduler, subscribers: Subscribers, event: DomainEvent): Promise<void> {
  const published = { ...event, fact: randomUUID() };
  for (const { job, only } of subscribers.get(event.type) ?? []) {
    if (only === undefined || only(published)) await jobs.enqueue(job, { event: published });
  }
}
