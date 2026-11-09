// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import { runStep } from "./workflowStep";

type Step = { id?: string; name?: string; if?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { if?: string; needs?: string; permissions?: Record<string, string>; outputs?: Record<string, string>; steps: Step[] };
type Workflow = { on: unknown; permissions: unknown; concurrency: { group: string; "cancel-in-progress": boolean }; jobs: Record<string, Job> };

const source = readFileSync(new URL("./promote-production.yml", import.meta.url), "utf8");
const workflow = parse(source) as Workflow;
const { sandbox, gate, promote, production } = workflow.jobs as Record<"sandbox" | "gate" | "promote" | "production", Job>;
const stepRunning = (job: Job, command: string) => job.steps.find((step) => step.run?.includes(command));

describe("promoting a commit of main to production", () => {
  test("runs for each push to main, or by hand, never for a pull request", () => {
    expect(workflow.on).toEqual({ push: { branches: ["main"] }, workflow_dispatch: null });
    expect(sandbox.if).toContain("github.ref == 'refs/heads/main'");
  });

  test("one promotion at a time, and a newer commit's run waits rather than cutting the running one off", () => {
    expect(workflow.concurrency).toEqual({ group: "promote-production", "cancel-in-progress": false });
  });

  test("is off until HEDGEHUG_PROMOTION is sandbox or production: the first job asks it and every later one needs it", () => {
    expect(sandbox.if).toBe("${{ github.ref == 'refs/heads/main' && (vars.HEDGEHUG_PROMOTION == 'sandbox' || vars.HEDGEHUG_PROMOTION == 'production') }}");
    expect([gate.needs, promote.needs, production.needs]).toEqual(["sandbox", "gate", "promote"]);
  });

  test("moves production only when HEDGEHUG_PROMOTION is production and the gate passed on the commit the sandbox still serves", () => {
    expect(promote.if).toBe("${{ needs.gate.outputs.outcome == 'ready' && vars.HEDGEHUG_PROMOTION == 'production' }}");
    expect(stepRunning(promote, "promote.ts fast-forward")?.env?.HEDGEHUG_PROMOTION).toBe("${{ vars.HEDGEHUG_PROMOTION }}");
  });

  test("waits for the commit's CI and the sandbox's deploy, then for the sandbox to serve exactly the commit", () => {
    const checks = stepRunning(sandbox, "promote.ts checks");
    expect(checks?.env?.REQUIRED_CHECKS?.trim().split("\n")).toEqual(["gate", "e2e-rewrite", "hosthog/deploy (hedgehug-sandbox)"]);
    const serves = stepRunning(sandbox, "promote.ts serves");
    expect(sandbox.steps.indexOf(serves!)).toBeGreaterThan(sandbox.steps.indexOf(checks!));
    expect(serves?.env?.APP_URL).toBe("${{ vars.HEDGEHUG_SANDBOX_URL }}");
    expect(gate.if).toBe("${{ needs.sandbox.outputs.outcome == 'ready' }}");
  });

  test("runs the journeys tagged @sandbox against the sandbox, then checks the sandbox still serves the commit they passed on", () => {
    const journeys = stepRunning(gate, "e2e run");
    expect(journeys?.run).toContain("--tag @sandbox\n");
    const still = stepRunning(gate, "promote.ts serves");
    expect(gate.steps.indexOf(still!)).toBeGreaterThan(gate.steps.indexOf(journeys!));
    expect(still?.env).toMatchObject({ APP_URL: "${{ vars.HEDGEHUG_SANDBOX_URL }}", DEADLINE_MS: "0" });
    expect(gate.outputs?.outcome).toBe(`\${{ steps.${still?.id}.outputs.outcome }}`);
  });

  test("after production moved, waits for it to serve the commit and runs only the journeys tagged @sandbox that write nothing", () => {
    expect(production.if).toBe("${{ needs.promote.outputs.production == 'moved' }}");
    const serves = stepRunning(production, "promote.ts serves");
    expect(serves?.env?.APP_URL).toBe("${{ vars.HEDGEHUG_PRODUCTION_URL }}");
    const journeys = stepRunning(production, "e2e run");
    expect(journeys?.run).toContain("--tag @sandbox --exclude-tag @writes\n");
    expect(production.steps.indexOf(journeys!)).toBeGreaterThan(production.steps.indexOf(serves!));
  });

  test("every step works on the commit that started the run", () => {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        if (step.uses?.startsWith("actions/checkout@")) expect(step.with?.ref).toBe("${{ github.sha }}");
        if (step.run?.includes("promote.ts")) expect(step.env?.SHA).toBe("${{ github.sha }}");
      }
    }
  });

  test("only the job that moves production can write, and only its checkout keeps a credential", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    for (const [name, job] of Object.entries(workflow.jobs)) {
      expect(job.permissions?.contents ?? "read", name).toBe(name === "promote" ? "write" : "read");
      const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
      expect(checkout?.with?.["persist-credentials"], name).toBe(name === "promote" ? undefined : false);
    }
  });

  test("each app's signing secret reaches only the journeys run against that app, and no other secret is read", () => {
    const run = (job: Job) => stepRunning(job, "e2e run")!;
    expect(run(gate).env?.SIGNING_SECRET).toBe("${{ secrets.HEDGEHUG_SANDBOX_SIGNING_SECRET }}");
    expect(run(production).env?.SIGNING_SECRET).toBe("${{ secrets.HEDGEHUG_PRODUCTION_SIGNING_SECRET }}");
    const elsewhere = JSON.stringify(workflow, (_, value) => (value === run(gate) || value === run(production) ? undefined : value));
    expect(elsewhere).not.toContain("secrets.");
  });

  test("never deploys anything itself: no Convex, no deploy workflow", () => {
    expect(source).not.toMatch(/convex|deploy-(sandbox|production)\.yml|gh workflow run/i);
  });

  test.each([
    ["gate", gate],
    ["production", production],
  ])("the %s journeys run on a target with no fakes, no clock and no sign-in, from the app's variables", (_, job) => {
    const step = stepRunning(job, "e2e run")!;
    const env = { APP_URL: "https://app.example", WORKSPACE: "T0", APP_ID: "A0", SIGNING_SECRET: "s3cret", RUNNER_TEMP: process.env.TMPDIR ?? "/tmp" };
    const script = step.run!.replace(/E2E_TARGET=.*$/m, 'cat "$target" > "$GITHUB_OUTPUT"');

    const { status, output } = runStep(script, { env });

    expect(status).toBe(0);
    expect(output.trim().split("\n")).toEqual([
      "KUDOS_TARGET_KIND=rewrite",
      "KUDOS_APP_URL=https://app.example",
      "KUDOS_SLACK_SIGNING_SECRET=s3cret",
      "KUDOS_SLACK_WORKSPACE=T0",
      "KUDOS_SLACK_APP_ID=A0",
      "KUDOS_SIGN_IN=edge-header",
      "KUDOS_HOSTED=true",
    ]);
  });
});
