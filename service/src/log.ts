// One JSON line per event on stdout. Callers pass names, statuses and durations only:
// never a header, a token, a request body or message text.

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Log {
  info(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export function jsonLog(write: (line: string) => void = (line) => process.stdout.write(line)): Log {
  const emit = (level: "info" | "error", message: string, fields: LogFields = {}) =>
    write(`${JSON.stringify({ time: new Date().toISOString(), level, message, ...fields })}\n`);
  return {
    info: (message, fields) => emit("info", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}

/**
 * What a log line may say about an error: its class and its code (a Postgres SQLSTATE such as `42P01`, or a system
 * code such as `ECONNREFUSED`), from it or the errors it wraps. Never its message: Drizzle's and pg's messages quote
 * the failing SQL and its parameters.
 */
export function errorFields(error: unknown): { error: string; code?: string } {
  const name = error instanceof Error ? error.name : "non-Error thrown";
  let code: string | undefined;
  for (let cause = error, depth = 0; cause instanceof Error && depth < 5 && !code; cause = cause.cause, depth++) {
    const candidate = (cause as { code?: unknown }).code;
    if (typeof candidate === "string" && /^[A-Z0-9_]{1,40}$/.test(candidate)) code = candidate;
  }
  return code ? { error: name, code } : { error: name };
}
