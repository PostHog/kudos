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
  const { appUrl, edgeSignInUrl } = targetOf();
  // Any other redirect, to a maintenance page or another host, would let a broken edge pass for one that signs in.
  if (!edgeSignInUrl) throw new Error("the hosted target sets no KUDOS_EDGE_SIGN_IN_URL, so the journey can't tell the edge's sign-in from any other redirect");
  for (const path of gated) {
    for (const [claim, headers] of Object.entries(claims)) {
      const answer = await fetch(new URL(path, appUrl), { headers, redirect: "manual" });

      expect([301, 302, 303, 307, 308], `${path} with ${claim}`).toContain(answer.status);
      const to = new URL(answer.headers.get("location") ?? "", appUrl).href;
      expect(to.startsWith(edgeSignInUrl), `${path} with ${claim} is sent to ${to}, not to ${edgeSignInUrl}`).toBe(true);
    }
  }
});
