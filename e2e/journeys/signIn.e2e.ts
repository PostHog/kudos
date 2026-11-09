import { expect, test } from "../test.ts";

// Signing in, as a member sees it. The protocol's own refusals (a wrong nonce, another client's token, a tampered
// state, a code redeemed twice or without its verifier) belong to today's Slack sign-in, which a rewrite replaces, so
// they stay in `pnpm test:handshake`; here each refusal is what the person sees.

test("a member who signs in from a deep link lands back on it, signed in", async ({ slack, website }) => {
  const member = await slack.member();

  await website.signIn(member, { path: "/leaderboard?period=month" });

  await expect(website.browser).toHaveURL(new RegExp(`/leaderboard\\?period=month$`));
  await expect(website.browser).toHaveTitle("HedgeHug · Leaderboard");
  await expect(website.screen.getByRole("link", { name: `Your profile, Member ${member}` })).toBeVisible();
});

test("someone from another workspace is refused, and no session is left behind", async ({ website }) => {
  await website.signIn("U_STRANGER", { workspace: "T_ELSEWHERE" });

  await expect(website.heading()).toHaveText("Sign-in didn't finish");
  await website.app.open("/");
  await expect(website.screen.getByRole("button", { name: "Sign in with Slack" })).toBeVisible();
});

test("someone the directory can't verify is never shown as a member", async ({ website }) => {
  // Slack's directory doesn't know this person, so every lookup of them fails.
  await website.signIn("U_UNKNOWN_TO_SLACK");

  await expect(website.heading()).toHaveText("Membership not checked", { timeout: 30_000 });
  await website.app.open("/leaderboard");
  await expect(website.heading()).toHaveText("Membership not checked");
  await expect(website.screen.getByRole("link", { name: /^Your profile/ })).toHaveCount(0);
});
