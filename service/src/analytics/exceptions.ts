import { z } from "zod";
import { errorFields, knownConnectionCodes } from "../log.ts";
import { NotPortedError } from "../notPorted.ts";
import { zv } from "../values.ts";

export class ReportableError extends Error {
  override name = "ReportableError";
}

export const exceptionValidator = z.strictObject({
  type: z.string(),
  value: z.string(),
  frames: z.array(z.strictObject({ filename: z.string(), function: z.string(), lineno: zv.number() })),
});

export type Exception = z.infer<typeof exceptionValidator>;

export const reportedMarker = "[reported]";

const markedFirstLine = /^(?:Uncaught Error: )?\[reported\] [A-Za-z_$][\w$]*$/;

const unexpectedError = "unexpected error";
const wordsWithheld = "message withheld: it may quote kudos text";
const typeName = /^[A-Za-z_$][\w$]*$/;
const stackFrame = /^\s*at (?:(.+?) \()?(.+?):(\d+):\d+\)?$/;
const uncaughtError = /^Uncaught ([A-Za-z_$][\w$]*): (.*)$/;

export function exceptionOf(error: unknown): Exception {
  const type = typeOf(error);
  const value = error instanceof ReportableError ? error.message : unexpectedError;
  return { type, value, frames: error instanceof Error ? framesOf(error) : [] };
}

export function withheldExceptionOf(error: unknown): Exception {
  return { ...exceptionOf(error), value: unexpectedError };
}

export function withheldErrorOf(error: unknown): Error {
  const withheld = new Error(`${wordsWithheld} (${typeOf(error)})`);
  if (error instanceof Error) withheld.stack = [`Error: ${withheld.message}`, ...stackLinesAfterTheMessage(error)].join("\n");
  // The service reads whether a failure is the database's, and retries one that is, by its code alone, so the code is
  // kept when it is one of those: any other code could be a member's words.
  const { code } = errorFields(error);
  return code !== undefined && isTroubleCode(code) ? Object.assign(withheld, { code }) : withheld;
}

// Postgres's SQLSTATEs of the classes the service retries or waits out (a connection, a transaction rolled back,
// resources, the operator, the system, a lock not available), Node's network errors and our own connection codes.
const troubleState = /^(?:08|40|53|55|57|58)[0-9A-Z]{3}$/;
const networkErrors: ReadonlySet<string> = new Set(["ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"]);

function isTroubleCode(code: string): boolean {
  return troubleState.test(code) || networkErrors.has(code) || knownConnectionCodes.has(code);
}

export function withholdingWords<Ctx, Args extends unknown[], Output>(handler: (ctx: Ctx, ...args: Args) => Promise<Output>) {
  return async (ctx: Ctx, ...args: Args): Promise<Output> => {
    try {
      return await handler(ctx, ...args);
    } catch (error) {
      // A stub not ported yet names only its module's path, never a member's words, and a waiting test reads it (S2's
      // module map; it goes once every stack has ported its bodies).
      if (error instanceof NotPortedError) throw error;
      throw withheldErrorOf(error);
    }
  };
}

const uniqueRefusal = /^unique\(\) query returned more than one result from table ([A-Za-z_]\w*):$/;
const transactionLimit = /^Too many (?:reads|writes|documents read|bytes read|bytes written) in a single function execution \(limit: \d+(?: bytes)?\)/;

export function exceptionOfJobError(error: string | undefined, tables: ReadonlySet<string>): Exception {
  const [, type = "Error", message = ""] = uncaughtError.exec(error?.split("\n")[0] ?? "") ?? [];
  if (type === ReportableError.name) return { type, value: message, frames: [] };
  return { type, value: (type === "Error" && convexsOwnRefusal(message, tables)) || unexpectedError, frames: [] };
}

function convexsOwnRefusal(message: string, tables: ReadonlySet<string>) {
  const [, table] = uniqueRefusal.exec(message) ?? [];
  if (table !== undefined) return tables.has(table) ? message.slice(0, -1) : undefined;
  return transactionLimit.exec(message)?.[0];
}

export function typeOf(error: unknown) {
  return error instanceof Error && typeName.test(error.name) ? error.name : "Error";
}

export function carriesReportedMarker(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return markedFirstLine.test(message.split("\n")[0]!);
}

export function postHogExceptionList({ type, value, frames }: Exception) {
  return [
    {
      type,
      value,
      mechanism: { handled: false, synthetic: false },
      stacktrace: { type: "raw", frames: frames.map((frame) => ({ platform: "custom", lang: "javascript", ...frame })) },
    },
  ];
}

function framesOf(error: Error): Exception["frames"] {
  return stackLinesAfterTheMessage(error)
    .flatMap((line) => {
      const [, name, filename, lineno] = stackFrame.exec(line) ?? [];
      if (filename === undefined) return [];
      return [{ filename: filename.replace(/^file:\/\//, "").replace(/\?.*$/, ""), function: functionName(name), lineno: Number(lineno) }];
    })
    .reverse();
}

function stackLinesAfterTheMessage(error: Error) {
  const headerLines = error.message.split("\n").length;
  return (error.stack ?? "").split("\n").slice(headerLines);
}

function functionName(name: string | undefined) {
  return name?.replace(/^async /, "") || "<anonymous>";
}
