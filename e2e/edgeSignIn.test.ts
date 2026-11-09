import { describe, expect, test } from "vitest";
import { isEdgeSignIn } from "./edgeSignIn.ts";

const appUrl = "https://app.example";
const signIn = "https://sso.example/oauth2/start";

describe("telling the edge's sign-in from any other redirect", () => {
  test("is the sign-in page itself, whatever the query carries back", () => {
    expect(isEdgeSignIn("https://sso.example/oauth2/start", appUrl, signIn)).toBe(true);
    expect(isEdgeSignIn("https://sso.example/oauth2/start?rd=%2Fme", appUrl, signIn)).toBe(true);
  });

  test("is not a sibling path that shares the sign-in's prefix", () => {
    expect(isEdgeSignIn("https://sso.example/oauth2/start-maintenance", appUrl, signIn)).toBe(false);
    expect(isEdgeSignIn("https://sso.example/oauth2/start/elsewhere", appUrl, signIn)).toBe(false);
  });

  test("is not another host whose name starts with the sign-in's", () => {
    expect(isEdgeSignIn("https://sso.example.evil.test/oauth2/start", appUrl, signIn)).toBe(false);
    expect(isEdgeSignIn("http://sso.example/oauth2/start", appUrl, signIn)).toBe(false);
  });

  test("resolves a relative redirect against the app, so a sign-in on the app's own origin matches and a maintenance page doesn't", () => {
    expect(isEdgeSignIn("/oauth2/start?rd=%2F", appUrl, `${appUrl}/oauth2/start`)).toBe(true);
    expect(isEdgeSignIn("/maintenance", appUrl, `${appUrl}/oauth2/start`)).toBe(false);
    expect(isEdgeSignIn("", appUrl, `${appUrl}/oauth2/start`)).toBe(false);
  });
});
