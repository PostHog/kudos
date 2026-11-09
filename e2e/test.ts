import { test as base } from "@e2e-dev/web";
import { Slack } from "./slack.ts";
import { targetOf } from "./target.ts";

export { expect } from "e2e";

export const test = base.extend<{ slack: Slack }>({
  slack: async ({}, use) => {
    await use(new Slack(targetOf()));
  },
});
