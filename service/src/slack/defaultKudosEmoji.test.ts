// The deployment's default kudos emoji, KUDOS_EMOJI, from outside: which emoji gives through the front door, which
// reaction marks it, and what the welcome and App Home name. Today's convex/slack/defaultKudosEmoji.test.ts. A message
// goes through the parser's hooks (S7, S9) and the directory's lookup (S3); giving replies (S5), welcomes (S5) and is
// placed in the spotlight (S11). App Home is S17's: the front door has no handler for app_home_opened until it lands.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { kudosReceived, post, setWorkspaceSettings, settle } from "../../testing/messageFlows.ts";
import { appHomeOpened, emoji, mention, section } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { notPorted } from "../notPorted.ts";
import { serviceRegistry } from "../registry.ts";

const now = new Date("2026-10-13T10:00:00Z");
const postedTs = "1760349600.000100";
const backend = useTestBackend({ now: now.getTime() });

const read: [Stack, ...Stack[]] = ["S3", "S7", "S9"];
const given: [Stack, ...Stack[]] = ["S3", "S5", "S7", "S9", "S11"];

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function withSlack() {
  const t = backend();
  t.slack.withMember("U_ALICE").withMember("U_BOB");
  return t;
}

describe("the deployment's default kudos emoji", () => {
  for (const setting of [undefined, ""]) {
    waitsOn(given, `with KUDOS_EMOJI=${setting}, :taco: gives kudos and is the reaction`, async () => {
      vi.stubEnv("KUDOS_EMOJI", setting);
      const t = withSlack();

      await post(t, [section(mention("U_BOB"), emoji("taco"))]);
      await settle(t);

      expect(await kudosReceived(t, "U_BOB")).toBe(1);
      expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    });
  }

  for (const setting of ["hedgehog", ":hedgehog:", "HedgeHog"]) {
    waitsOn(given, `with KUDOS_EMOJI=${setting}, :hedgehog: gives kudos and is the reaction`, async () => {
      vi.stubEnv("KUDOS_EMOJI", setting);
      const t = withSlack();

      await post(t, [section(mention("U_BOB"), emoji("hedgehog"))]);
      await settle(t);

      expect(await kudosReceived(t, "U_BOB")).toBe(1);
      expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["hedgehog"]);
    });
  }

  waitsOn(read, "with KUDOS_EMOJI set, :taco: is ordinary chat", async () => {
    vi.stubEnv("KUDOS_EMOJI", "hedgehog");
    const t = withSlack();

    await post(t, [section(mention("U_BOB"), emoji("taco"))]);
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(t.slack.callsTo("reactions.add")).toEqual([]);
  });

  waitsOn(given, "with KUDOS_EMOJI set, the welcome message names it", async () => {
    vi.stubEnv("KUDOS_EMOJI", "hedgehog");
    const t = withSlack();

    await post(t, [section(mention("U_BOB"), emoji("hedgehog"))]);
    await settle(t);

    const welcomes = t.slack.callsTo("chat.postMessage").map((args) => String(args.text));
    expect(welcomes).toHaveLength(2);
    expect(welcomes.find((welcome) => welcome.includes("just thanked you"))).toContain("add :hedgehog: to your message");
    for (const welcome of welcomes) expect(welcome).not.toContain(":taco:");
  });

  waitsOn(["S17"], "with KUDOS_EMOJI set, App Home names it", async () => {
    vi.stubEnv("KUDOS_EMOJI", "hedgehog");
    const t = withSlack();

    await openHome(t, "U_BOB");

    const home = JSON.stringify(t.slack.callsTo("views.publish").at(-1)?.view);
    expect(home).toContain("add :hedgehog: to your message. Each :hedgehog: gives everyone you mention 1 kudos.");
    expect(home).not.toContain(":taco:");
  });

  waitsOn(given, "a workspace's own emoji still wins over KUDOS_EMOJI", async () => {
    vi.stubEnv("KUDOS_EMOJI", "hedgehog");
    const t = withSlack();
    await setWorkspaceSettings(t, { kudosEmoji: "pizza" });

    await post(t, [section(mention("U_BOB"), emoji("pizza"))]);
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["pizza"]);
  });
});

/** Opens the member's App Home through the front door; until S17 registers its handler, the event reaches nothing. */
async function openHome(t: TestBackend, user: string) {
  if (serviceRegistry.slack.events?.homeOpened === undefined) throw notPorted("slack.events.homeOpened");
  await t.send("/events", appHomeOpened(user));
  await settle(t);
}
