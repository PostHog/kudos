// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { targetLines, targetOf, type Target } from "./target.ts";

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "kudos-target-test-"));
});
afterEach(() => rm(folder, { recursive: true, force: true }));

const rewrite: Target = { kind: "rewrite", appUrl: "http://127.0.0.1:1", signingSecret: "s", workspace: "T1", appId: "A_KUDOS", fakesUrl: "http://127.0.0.1:2", signIn: "edge-header", testSecret: "t" };

async function fileOf(text: string) {
  const file = join(folder, "target.env");
  await writeFile(file, text);
  return file;
}

describe("a target file", () => {
  test("names the rewrite, signed in to through the edge, and reads back as it was written", async () => {
    expect(targetOf(await fileOf(targetLines(rewrite)))).toEqual({ ...rewrite, timeUrl: "http://127.0.0.1:1/testing/time", hosted: false, edgeSignInUrl: undefined });
  });

  test("that names no kind is today's app, the oracle", async () => {
    const { kind, ...withoutKind } = rewrite;

    expect(targetOf(await fileOf(targetLines({ ...withoutKind, signIn: "slack-openid" } as Target))).kind).toBe("oracle");
  });

  test("on the hosting platform needs no fakes, and says it is hosted", async () => {
    const { fakesUrl, testSecret, ...hosted } = rewrite;
    const file = await fileOf(targetLines({ ...hosted, fakesUrl: "", hosted: true, edgeSignInUrl: "https://sso.example/start" }));

    expect(targetOf(file)).toMatchObject({ hosted: true, fakesUrl: "", testSecret: undefined, edgeSignInUrl: "https://sso.example/start" });
    await writeFile(file, targetLines({ ...hosted, fakesUrl: "" }));
    expect(() => targetOf(file), "a target off the platform").toThrow(/sets no KUDOS_FAKES_URL/);
  });

  test("that names a kind the suite doesn't know is refused", async () => {
    expect(() => targetOf(join(folder, "none.env"))).toThrow();
    const file = await fileOf(`${targetLines(rewrite)}KUDOS_TARGET_KIND=staging\n`);

    expect(() => targetOf(file)).toThrow(/KUDOS_TARGET_KIND=staging/);
  });
});
