import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "convex",
          include: ["**/*.test.ts"],
          exclude: ["node_modules/**", "website/**", "service/**"],
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
          env: { KUDOS_EMOJI: "" },
        },
      },
      "website",
      {
        // The rewrite: plain Node on a throwaway Postgres 18 the global setup starts, one schema per worker.
        test: {
          name: "service",
          root: "service",
          include: ["**/*.test.ts"],
          exclude: ["node_modules/**"],
          environment: "node",
          globalSetup: ["testing/postgres.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        test: {
          name: "website-build",
          include: ["website/src/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
