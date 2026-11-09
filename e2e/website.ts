import type { Browser } from "@e2e-dev/web";
import { expect, type App, type Screen } from "e2e";
import { productionFlags } from "./fakes/productionFlags.ts";
import { signInPath } from "./local/edge.ts";
import type { Target } from "./target.ts";

// The website as a member uses it, in a browser. Signing in is the one step each target does its own way: today's app
// signs in with Slack, so the fakes act as Slack's OpenID issuer and send the browser straight back as the member a
// journey names. The rewrite's edge signs members in before the app sees them, so its stand-in (local/edge.ts) takes
// the member's email and sends the browser back. A target that signs in another way adds its mechanism here and names
// it in its target file.

export type SignInAs = { workspace?: string };

type SignIn = (website: Website, member: string, as: Required<SignInAs>) => Promise<void>;

const signIns: Record<Target["signIn"], SignIn> = {
  "slack-openid": async (website, member, { workspace }) => {
    await website.control("next-sign-in", { team: workspace, user: member, name: `Member ${member}` });
    await website.screen.getByRole("button", { name: "Sign in with Slack" }).click();
    // Slack's return lands on the website with a one-time code, which the website redeems and drops from the address.
    await website.backOnTheWebsite((url) => !url.searchParams.has("code"));
  },
  // The workspace means nothing to the edge: a member of another one is an email the app finds in no workspace.
  "edge-header": async (website, member) => {
    const here = new URL(await website.browser.url());
    await website.app.open(`${signInPath}?${new URLSearchParams({ email: memberEmail(member), to: here.pathname + here.search })}`);
    await website.backOnTheWebsite((url) => url.pathname !== signInPath);
  },
};

// The email a member signs in to the edge with. Once the rewrite serves the website (S15), it looks the email up in
// Slack, and the Slack fake learns it with each member.
export function memberEmail(member: string) {
  return `${member.toLowerCase()}@example.com`;
}

export class Website {
  readonly target: Target;
  readonly app: App;
  readonly screen: Screen;
  readonly browser: Browser;

  constructor(target: Target, { app, screen, browser }: { app: App; screen: Screen; browser: Browser }) {
    this.target = target;
    this.app = app;
    this.screen = screen;
    this.browser = browser;
  }

  // Opens `path` signed out and signs in from there, as `member` of the target's workspace or of `workspace`. It
  // returns once the browser is back on the website, whatever the website made of the sign-in. A member's home
  // address moves on to their profile once it loads, so a journey that goes on to another page signs in there.
  async signIn(member: string, { path = "/", workspace = this.target.workspace }: SignInAs & { path?: string } = {}) {
    await this.app.open(path);
    await this.markThePage();
    await signIns[this.target.signIn](this, member, { workspace });
  }

  // Marks the page the browser shows now, so `backOnTheWebsite` can tell it from the page it lands on after leaving it.
  async markThePage() {
    await this.browser.evaluate(() => {
      (window as unknown as { leftBehind?: true }).leftBehind = true;
      return true;
    });
  }

  // Waits until the browser has left the marked page and is back on the website at an address `settled` accepts, and
  // stays there: the website may still move on by itself, as from its home address to the member's profile.
  async backOnTheWebsite(settled: (url: URL) => boolean) {
    const origin = new URL(this.target.appUrl).origin;
    const landed = async () => {
      const url = new URL(await this.browser.url());
      const fresh = await this.browser.evaluate(() => document.readyState === "complete" && (window as unknown as { leftBehind?: true }).leftBehind !== true).catch(() => false);
      return fresh && url.origin === origin && settled(url) ? url.href : undefined;
    };
    await expect
      .poll(async () => {
        const first = await landed();
        await new Promise((resolve) => setTimeout(resolve, 750));
        return first !== undefined && first === (await landed());
      })
      .toBe(true);
  }

  // Opens `path` and waits past the moments the website greets a member with (the XP since their last visit, an
  // emoji or a sticker they unlocked), so the page beneath them shows.
  async open(path: string) {
    await this.app.open(path);
    await this.pastTheMoments();
  }

  async pastTheMoments() {
    const moment = this.screen.getByRole("dialog").first();
    for (let shown = 0; shown < 10; shown++) {
      const showing = await moment.waitFor({ state: "visible", timeout: 2_000 }).then(() => true, () => false);
      if (!showing) return;
      const skip = moment.getByRole("button", { name: "Skip" });
      if (await skip.isVisible()) await skip.click();
      else await this.browser.keyboard.press("Escape");
      await moment.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
    }
    throw new Error("the website kept showing moments");
  }

  // The page's title, which every page of the website shows as its one top heading.
  heading() {
    return this.screen.getByRole("heading", { level: 1 });
  }

  // Serves the flags production had with `key` switched, and returns once the app has reloaded them.
  async switchFlag(key: string, on: boolean) {
    await this.control("flags", productionFlags.map((flag) => (flag.key === key ? { ...flag, active: on } : flag)));
  }

  async control(path: string, value: unknown) {
    const response = await fetch(`${this.target.fakesUrl}/_control/${path}`, { method: "POST", body: JSON.stringify(value) });
    if (!response.ok) throw new Error(`the fakes refused ${path}: ${response.status} ${await response.text()}`);
  }
}
