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

/** An error's class and message, without its stack or any value it carries. */
export function errorName(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "non-Error thrown";
}
