// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { if?: string; permissions?: unknown; steps: Step[] };
type Workflow = { on: { push: { branches: string[]; paths: string[] }; workflow_dispatch: { inputs: Record<string, { type: string; options?: string[]; default: unknown }> } }; permissions: unknown; concurrency: unknown; jobs: Record<string, Job> };

const source = readFileSync(new URL("./slack-manifest.yml", import.meta.url), "utf8");
const workflow = parse(source) as Workflow;
const { sandbox, production } = workflow.jobs as Record<"sandbox" | "production", Job>;
const step = (job: Job) => job.steps.find((each) => each.run === "node tools/release/slackManifest.ts")!;

describe("changing the Slack apps' manifests", () => {
  test("runs for a push to main that changes what the manifest is rendered from, or by hand naming one app", () => {
    expect(workflow.on.push).toEqual({ branches: ["main"], paths: ["slack-app/**", "convex/feedback/naming.ts", "tools/release/manifestUpdate.ts", "tools/release/slackManifest.ts"] });
    expect(workflow.on.workflow_dispatch.inputs.app).toMatchObject({ type: "choice", options: ["sandbox", "production"], default: "sandbox" });
    expect(Object.keys(workflow.jobs)).toEqual(["sandbox", "production"]);
  });

  test("is off until HEDGEHUG_MANIFEST_UPDATES is set, and only from main", () => {
    expect(sandbox.if).toBe("${{ github.ref == 'refs/heads/main' && (vars.HEDGEHUG_MANIFEST_UPDATES == 'sandbox' || vars.HEDGEHUG_MANIFEST_UPDATES == 'production') && (github.event_name == 'push' || inputs.app == 'sandbox') }}");
    expect(production.if).toContain("github.ref == 'refs/heads/main'");
  });

  test("changes the production app only by a run started by hand that names it, with the switch at production", () => {
    expect(production.if).toBe("${{ github.ref == 'refs/heads/main' && vars.HEDGEHUG_MANIFEST_UPDATES == 'production' && github.event_name == 'workflow_dispatch' && inputs.app == 'production' }}");
  });

  test("a push sends the sandbox's manifest; a run by hand only plans unless told to apply", () => {
    expect(workflow.on.workflow_dispatch.inputs.apply).toMatchObject({ type: "boolean", default: false });
    expect(step(sandbox).env?.APPLY).toBe("${{ github.event_name == 'push' || inputs.apply }}");
    expect(step(production).env?.APPLY).toBe("${{ inputs.apply }}");
  });

  test.each([
    ["sandbox", "SANDBOX"],
    ["production", "PRODUCTION"],
  ] as const)("the %s job renders for its own app's URL and reaches Slack with that app's token and signing secret alone", (name, prefix) => {
    const job = workflow.jobs[name]!;
    expect(step(job).env).toMatchObject({
      APP: name,
      APP_URL: `\${{ vars.HEDGEHUG_${prefix}_URL }}`,
      APP_ID: `\${{ vars.HEDGEHUG_${prefix}_APP_ID }}`,
      SLACK_SERVICE_TOKEN: `\${{ secrets.HEDGEHUG_${prefix}_SLACK_SERVICE_TOKEN }}`,
      SIGNING_SECRET: `\${{ secrets.HEDGEHUG_${prefix}_SIGNING_SECRET }}`,
    });
    const secrets = JSON.stringify(job).match(/secrets\.\w+/g);
    expect(secrets).toEqual([`secrets.HEDGEHUG_${prefix}_SLACK_SERVICE_TOKEN`, `secrets.HEDGEHUG_${prefix}_SIGNING_SECRET`]);
  });

  test("reads only, keeps no credential, runs one change at a time and works on the commit that started it", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({ group: "slack-manifest", "cancel-in-progress": false });
    for (const job of [sandbox, production]) {
      expect(job.permissions).toBeUndefined();
      expect(job.steps[0]).toMatchObject({ with: { ref: "${{ github.sha }}", "persist-credentials": false } });
    }
  });

  test("never deploys anything: no Convex, no deploy workflow", () => {
    expect(source).not.toMatch(/convex (deploy|run)|deploy-(sandbox|production)\.yml|gh workflow run/i);
  });
});
