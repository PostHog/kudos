import { targetOf } from "../target.ts";
import { expect, test } from "../test.ts";

// The rewrite's health check, which the hosting platform asks before it sends the rewrite any traffic and which the
// promotion gate reads the commit from. Today's app has none, so the journey skips there, saying why.

const onlyTheRewrite = targetOf().kind === "rewrite" ? false : "today's app has no health check; only the rewrite answers /healthz";

test("the rewrite answers its health check with the commit it runs, its migrations done", { skip: onlyTheRewrite, tags: ["@sandbox"] }, async () => {
  const answer = await fetch(`${targetOf().appUrl}/healthz`);

  expect(answer.status).toBe(200);
  expect(await answer.json()).toEqual({ commit: expect.stringMatching(/^[0-9a-f]{40}$/), migrations: "done", off: false });
});
