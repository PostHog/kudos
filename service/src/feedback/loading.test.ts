// Notices and replies import their Slack delivery, and the delivery imports them back. Whichever of them a process loads
// first, each must finish loading: a job's arguments that read a value its importer hasn't defined yet stop the
// service at start with a ReferenceError. Each module loads first in a fresh Node process, as the service starts.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const run = promisify(execFile);
const source = fileURLToPath(new URL("..", import.meta.url));

const firstLoaded = [
  "feedback/notify.ts",
  "feedback/notification.ts",
  "feedback/beside.ts",
  "feedback/homes.ts",
  "feedback/replies.ts",
  "slack/directMessages.ts",
  "slack/delivery.ts",
  "slack/appHome.ts",
  "slack/publicReplies.ts",
];

test.each(firstLoaded)("%s loads first in a fresh process", async (module) => {
  const { stdout } = await run(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", `await import(${JSON.stringify(source + module)}); console.log("loaded");`]);

  expect(stdout.trim()).toBe("loaded");
}, 60_000);
