// Ports today's convex/workspace/workspaceSettings.test.ts: who may see and change the workspace settings, and the
// bounds a save keeps, through the service's settings functions. The website's Settings read and command (S17), its
// sections (S17), a kudos given by the saved emoji (S4) and a Slack click carrying the command (S4) reach other stacks'
// bodies, and join this file through the test-port ledger's waiting column.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import type { FlagDefinition } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { MemberId } from "./directory.ts";
import { changeWorkspaceSettings, workspaceSettingsPartOf, workspaceSettingsShownTo, type EditableSettings } from "./workspaceSettings.ts";

const now = new Date("2026-10-17T10:00:00Z").getTime();
const workspaceSettings = "workspace-settings";
const maintainer = "U_MAINTAINER";

const defaults = { baseAllowance: 3, kudosEmoji: "taco", kudosEmojiImage: null, hugBudget: 10 };

const backend = useTestBackend({ now });
let t: TestBackend;

beforeEach(() => {
  vi.stubEnv("KUDOS_EMOJI", "");
  vi.stubEnv("KUDOS_MAINTAINER", maintainer);
  postHogDeciding("sandbox");
  t = backend();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// The directory's member row for `user` in T1, as Slack's events would keep it.
const memberRow = (user: string, fields: { admin?: boolean; name?: string; kind?: "member" | "bot" | "not-a-member" } = {}) =>
  t.seed.insert("members", { workspace: "T1", user, kind: "member", asOf: 0, ...fields }) as Promise<MemberId>;

// Flag definitions stored as PostHog would serve them.
const flags = (...definitions: FlagDefinition[]) => definitionsStored(t.operations, ...definitions);


const workspaceSettingsOn = () => flags(onForEveryone(workspaceSettings));
const workspaceSettingsOff = () => flags(offForEveryone(workspaceSettings));

// The website's read: the workspace part only for the member it is shown to, and the command's outcome.
async function aTeammate(user: string, { admin = false } = {}) {
  const member: MemberId = await memberRow(user, { name: user, admin });
  // Signing in gives a member their analytics ID, as today's signed-in session did, so the read decides for them.
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return {
    member,
    workspacePart: () => t.query(async (ctx) => ((await workspaceSettingsShownTo(ctx, member)) ? workspaceSettingsPartOf(ctx, "T1") : undefined)),
    save: (settings: EditableSettings) => t.run((ctx) => changeWorkspaceSettings(ctx, "T1", member, settings)),
  };
}

const workspaceRows = () => t.seed.all("workspaces");

async function workspaceSettingsExposures() {
  return (await t.seed.all("flagExposures")).filter(({ flag }) => flag === workspaceSettings).map(({ member, value }) => ({ member, value }));
}

describe("the maintainer changes the workspace settings from Settings", () => {
  test("the maintainer's Settings carry the daily allowance, the kudos emoji and the hug budget, with their defaults", async () => {
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);

    expect(await owner.workspacePart()).toEqual(defaults);
  });

  test("a save stores all three, the Settings read shows them", async () => {
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);

    expect(await owner.save({ baseAllowance: 5, kudosEmoji: " :Pizza: ", hugBudget: 0 })).toEqual({ kind: "set", saved: { baseAllowance: 5, kudosEmoji: "pizza", hugBudget: 0 } });

    expect(await owner.workspacePart()).toEqual({ baseAllowance: 5, kudosEmoji: "pizza", kudosEmojiImage: null, hugBudget: 0 });
  });

  test("the kudos emoji's picture comes with it when it is one of the workspace's own emoji", async () => {
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);
    await t.seed.insert("customEmoji", { workspace: "T1", name: "hoggo", image: "https://emoji.slack-edge.com/T1/hoggo/1.png", listing: 1 });

    await owner.save({ baseAllowance: 3, kudosEmoji: "hoggo", hugBudget: 10 });

    expect(await owner.workspacePart()).toEqual({ ...defaults, kudosEmoji: "hoggo", kudosEmojiImage: "https://emoji.slack-edge.com/T1/hoggo/1.png" });
  });

  test("a save for a workspace with no row yet stores one", async () => {
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);

    await owner.save({ baseAllowance: 4, kudosEmoji: "taco", hugBudget: 10 });

    expect(await workspaceRows()).toMatchObject([{ workspace: "T1", baseAllowance: 4, kudosEmoji: "taco", hugBudget: 10 }]);
  });

  test("a second save changes the one row", async () => {
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);

    await owner.save({ baseAllowance: 4, kudosEmoji: "taco", hugBudget: 10 });
    await owner.save({ baseAllowance: 6, kudosEmoji: "pizza", hugBudget: 2 });

    expect(await workspaceRows()).toMatchObject([{ workspace: "T1", baseAllowance: 6, kudosEmoji: "pizza", hugBudget: 2 }]);
  });

  test("the command decides workspace-settings with exposure, and the read without", async () => {
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);
    await owner.workspacePart();
    expect(await workspaceSettingsExposures()).toEqual([]);

    await owner.save({ baseAllowance: 4, kudosEmoji: "taco", hugBudget: 10 });

    expect(await workspaceSettingsExposures()).toEqual([{ member: owner.member, value: true }]);
  });
});

describe("only the maintainer changes the workspace settings", () => {
  test("a workspace admin who isn't the maintainer sees no workspace part, and their save is refused and writes nothing", async () => {
    await workspaceSettingsOn();
    const admin = await aTeammate("U_ADMIN", { admin: true });

    expect(await admin.workspacePart()).toBeUndefined();
    expect(await admin.save({ baseAllowance: 9, kudosEmoji: "pizza", hugBudget: 1 })).toEqual({ kind: "refused", reason: "not-maintainer", saved: null });
    expect(await workspaceRows()).toEqual([]);
    expect(await workspaceSettingsExposures()).toEqual([]);
  });

  test("with no maintainer configured, nobody sees the part or saves", async () => {
    vi.stubEnv("KUDOS_MAINTAINER", "");
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);

    expect(await owner.workspacePart()).toBeUndefined();
    expect(await owner.save({ baseAllowance: 9, kudosEmoji: "pizza", hugBudget: 1 })).toEqual({ kind: "refused", reason: "not-maintainer", saved: null });
    expect(await workspaceRows()).toEqual([]);
  });

  test("a KUDOS_MAINTAINER naming another user leaves this member out", async () => {
    vi.stubEnv("KUDOS_MAINTAINER", "U_SOMEONE_ELSE");
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);

    expect(await owner.save({ baseAllowance: 9, kudosEmoji: "pizza", hugBudget: 1 })).toEqual({ kind: "refused", reason: "not-maintainer", saved: null });
    expect(await workspaceRows()).toEqual([]);
  });

  test("while workspace-settings is off, the maintainer sees no workspace part and the command refuses with no reason, writing nothing", async () => {
    await workspaceSettingsOff();
    const owner = await aTeammate(maintainer);

    expect(await owner.workspacePart()).toBeUndefined();
    expect(await owner.save({ baseAllowance: 9, kudosEmoji: "pizza", hugBudget: 1 })).toBeNull();
    expect(await workspaceRows()).toEqual([]);
  });
});

describe("a workspace settings save stays in bounds", () => {
  test.each([
    ["an allowance of 0", { baseAllowance: 0 }, "allowance"],
    ["an allowance above 20", { baseAllowance: 21 }, "allowance"],
    ["a fractional allowance", { baseAllowance: 2.5 }, "allowance"],
    ["a negative hug budget", { hugBudget: -1 }, "hug-budget"],
    ["a hug budget above 50", { hugBudget: 51 }, "hug-budget"],
    ["a fractional hug budget", { hugBudget: 1.5 }, "hug-budget"],
    ["an empty emoji", { kudosEmoji: " :: " }, "kudos-emoji"],
    ["an emoji with a space", { kudosEmoji: "two words" }, "kudos-emoji"],
    ["a skin-toned emoji", { kudosEmoji: "wave::skin-tone-2" }, "kudos-emoji"],
  ] as const)("%s is refused and writes nothing", async (_, change, reason) => {
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);

    expect(await owner.save({ baseAllowance: 3, kudosEmoji: "taco", hugBudget: 10, ...change })).toEqual({ kind: "refused", reason, saved: null });

    expect(await workspaceRows()).toEqual([]);
  });

  test("the edges of each range are saved", async () => {
    await workspaceSettingsOn();
    const owner = await aTeammate(maintainer);

    expect((await owner.save({ baseAllowance: 1, kudosEmoji: "+1", hugBudget: 0 }))?.kind).toBe("set");
    expect((await owner.save({ baseAllowance: 20, kudosEmoji: "man-woman-boy", hugBudget: 50 }))?.kind).toBe("set");

    expect(await owner.workspacePart()).toEqual({ baseAllowance: 20, kudosEmoji: "man-woman-boy", kudosEmojiImage: null, hugBudget: 50 });
  });
});
