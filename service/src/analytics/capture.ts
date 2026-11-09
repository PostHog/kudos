// Today's convex/analytics/capture.ts: the analytics settings, read from the environment when they are used.
export type Environment = "sandbox" | "production";

export type Capture = { token: string; environment: Environment; host: string };

const environments: readonly string[] = ["sandbox", "production"] satisfies Environment[];
const defaultHost = "https://us.i.posthog.com";

/** Capture is on with the project token and a known environment; otherwise nothing is recorded. */
export function captureSettings(): Capture | null {
  const token = process.env.POSTHOG_PROJECT_TOKEN;
  const environment = environmentSetting();
  if (!token || environment === null) return null;
  return { token, environment, host: postHogHost() };
}

export function postHogHost(): string {
  return process.env.POSTHOG_HOST || defaultHost;
}

export function environmentSetting(): Environment | null {
  const environment = process.env.KUDOS_ENVIRONMENT;
  return environment !== undefined && environments.includes(environment) ? (environment as Environment) : null;
}

export function nativeErrorReportingOn(): boolean {
  return process.env.POSTHOG_NATIVE_ERRORS === "on";
}

/** The personal API key that reads the flags' definitions; without it no flag is evaluated. */
export function flagsKey(): string | null {
  return (process.env.POSTHOG_PERSONAL_API_KEY ?? "").trim() || null;
}
