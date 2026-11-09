import { test as base } from "@e2e-dev/web";
import { Slack, type SlackCall } from "./slack.ts";
import { targetOf } from "./target.ts";
import { Website } from "./website.ts";

import { expect } from "e2e";

export { expect };

// What the app must not do can't be awaited: it promises no order between its jobs and has no "done" to wait for.
// So a journey reads it again and again for a while, and fails as soon as it changes. A give lands in under a second.
export async function staysEqual<Value>(read: () => Promise<Value>, expected: Value, forMs = 3_000) {
  const until = Date.now() + forMs;
  do {
    expect(await read()).toEqual(expected);
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < until);
}

// A giver's reply opens with what they gave, the XP it earned and what's left today, then any mention it skipped. The
// lines after those (goals, quests, album items) belong to the journeys of those features.
export function receipt(reply: SlackCall) {
  const [headline = "", ...rest] = String(reply.text).split("\n");
  return [headline, ...rest.filter((line) => /kudos left today$|last kudos for today|^I skipped /.test(line))].join("\n");
}

export const test = base.extend<{ slack: Slack; website: Website }>({
  slack: async ({}, use) => {
    await use(new Slack(targetOf()));
  },
  website: async ({ app, screen, browser }, use) => {
    await use(new Website(targetOf(), { app, screen, browser }));
  },
});
