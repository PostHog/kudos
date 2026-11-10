import { expect, test } from "vitest";
import { notPorted, notPortedValue } from "../src/notPorted.ts";
import { stillWaiting, waitsOn } from "./waiting.ts";

test("a body that ends in another stack's stub is still waiting, and names the stub", async () => {
  const path = await stillWaiting(["S3"], async () => {
    await Promise.resolve();
    throw notPorted("workspace.settings.settingsOf");
  });

  expect(path, "the stub it reached").toBe("workspace.settings.settingsOf");
});

test("a stub value used on the way counts as the stub it is", async () => {
  const hook = notPortedValue<{ name: string }>("store.inventory.ownedKudosEmojiHook");

  expect(await stillWaiting(["S7"], () => hook.name), "the stub it reached").toBe("store.inventory.ownedKudosEmojiHook");
});

test("a body that fails any other way is a defect, not a wait", async () => {
  const failing = stillWaiting(["S3"], () => expect(1, "an assertion before the stub").toBe(2));

  await expect(failing, "the failure").rejects.toThrow("an assertion before the stub");
});

test("a body that passes fails, naming the stacks whose last merge turns it on", async () => {
  const passing = stillWaiting(["S3", "S7"], async () => {});

  await expect(passing, "the failure").rejects.toThrow("make it a plain test and empty its ledger row's Waits on (S3 S7)");
});

waitsOn(["S3"], "waitsOn declares a test that passes while its body ends in a stub", () => {
  throw notPorted("workspace.settings.settingsOf");
});
