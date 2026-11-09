import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";
import { targetOf } from "./target.ts";

export default {
  projectId: "hedgehug",
  tests: "journeys/**/*.e2e.ts",
  targets: [{ name: "hedgehug", engine: web(), app: { url: targetOf().appUrl, identity: "hedgehug" } }],
  workers: 1,
  timeout: 60_000,
  assertionTimeout: 15_000,
} satisfies E2EConfig;
