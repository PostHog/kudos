import { targetOf } from "../target.ts";
import { expect, test } from "../test.ts";

// What the promotion gate checks on the hosting platform, beside the other journeys tagged @sandbox: its edge lets
// nobody reach the website or its API without signing in, whatever identity a request claims for itself. Only the
// hosted edge signs visitors in; the rig's stand-in signs anyone in by design, and today's app has no edge at all.

const onlyHosted = targetOf().hosted ? false : "only the hosting platform's edge signs visitors in; the rig's stand-in signs anyone in";

const gated = ["/", "/me", "/api/live", "/api/query/me"];
const claims: Record<string, Record<string, string>> = {
  "no identity": {},
  "a forged email header": { "x-auth-request-email": "someone@example.com" },
  "the header's underscore form": { x_auth_request_email: "someone@example.com" },
};

test("a visitor who hasn't signed in is sent to the edge's sign-in from the website and its API, whatever they claim", { skip: onlyHosted, tags: ["@sandbox"] }, async () => {
  const { appUrl } = targetOf();
  for (const path of gated) {
    for (const [claim, headers] of Object.entries(claims)) {
      const asked = new URL(path, appUrl);
      const answer = await fetch(asked, { headers, redirect: "manual" });

      expect([301, 302, 303, 307, 308], `${path} with ${claim}`).toContain(answer.status);
      const to = new URL(answer.headers.get("location") ?? "", asked);
      expect(`${to.origin}${to.pathname}`, `where ${path} with ${claim} is sent`).not.toBe(`${asked.origin}${asked.pathname}`);
    }
  }
});
