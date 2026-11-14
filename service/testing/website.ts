// How a test signs a website request in, the way the website's API sees it. The edge's single sign-on names the
// signed-in person by email in `x-auth-request-email`; there is no session or cookie of the app's own. The service maps
// that email to a member (service/src/website/identity.ts): the sign-in workspace's (`SLACK_WORKSPACE_ID`) directory
// entry whose `email` holds it, in any case, or else the person Slack's `users.lookupByEmail` names, which the fake
// Slack answers from `withMember(id, { profile: { email } })`. Today's member check then answers, behind the website
// flag: until `websiteOpenIn` opens it, every request answers `{ kind: "closed" }`.
//
//   const t = backend();
//   await websiteOpenIn(t);
//   await t.seed.insert("members", { workspace: "T1", user: "U_JUNO", kind: "member", email: "juno@example.com" });
//   const answer = await t.app.request("/api/query/website.album.getAlbum", websiteRequest({}, "juno@example.com"));
//
// The paths are `/api/query/<name>` for a read, `/api/mutation/<name>` for a command, `/api/entry` for the page load
// that signs a person in and `GET /api/live` for the stream of invalidations; the edge's header reaches no other path.
import { vi } from "vitest";
import { workspaceKeyOf } from "../src/analytics/outbox.ts";
import { apiHeader } from "../src/website/api/transport.ts";
import { edgeEmailHeader } from "../src/website/identity.ts";
import type { TestBackend } from "./backend.ts";
import { flagsKey, postHogHost, projectToken } from "./fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "./flags.ts";

/**
 * Sets the sign-in workspace and the flag settings, and opens the website flag to everyone in it, or closes it; the
 * flag decides on the workspace's key, which this makes. Undo the settings with `vi.unstubAllEnvs()`. It leaves
 * `fetch` alone: the test backend already routes it to the fake PostHog and the fake Slack, and stubbing it again, as
 * `postHogDeciding` does, would cut the fake Slack off.
 */
export async function websiteOpenIn(t: TestBackend, { workspace = "T1", open = true }: { workspace?: string; open?: boolean } = {}): Promise<void> {
  vi.stubEnv("SLACK_WORKSPACE_ID", workspace);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  await t.run((ctx) => workspaceKeyOf(ctx, workspace));
  await definitionsStored(t.operations, open ? onForEveryone("website") : offForEveryone("website"));
}

/** A website API request as the website sends it, with `args` as its body, signed in as `email` by the edge; without one, signed out. */
export function websiteRequest(args: unknown = {}, email?: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", [apiHeader]: "1", ...(email !== undefined && { [edgeEmailHeader]: email }) },
    body: JSON.stringify(args),
  };
}
