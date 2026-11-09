import { test as base } from "@e2e-dev/web";
import { Slack } from "./slack.ts";
import { targetOf } from "./target.ts";

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

export const test = base.extend<{ slack: Slack }>({
  slack: async ({}, use) => {
    await use(new Slack(targetOf()));
  },
});
