import { v, type Infer } from "convex/values";

export class ReportableError extends Error {
  override name = "ReportableError";
}

export const exceptionValidator = v.object({
  type: v.string(),
  value: v.string(),
  frames: v.array(v.object({ filename: v.string(), function: v.string(), lineno: v.number() })),
});

export type Exception = Infer<typeof exceptionValidator>;

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
  return withheld;
}

export function withholdingWords<Ctx, Args extends unknown[], Output>(handler: (ctx: Ctx, ...args: Args) => Promise<Output>) {
  return async (ctx: Ctx, ...args: Args): Promise<Output> => {
    try {
      return await handler(ctx, ...args);
    } catch (error) {
      throw withheldErrorOf(error);
    }
  };
}

const convexsOwnRefusals = [/^unique\(\) query returned more than one result from table [A-Za-z_]\w*(?=:$)/, /^Too many [a-z ]+ in a single function execution \(limit: \d+\)/];

export function exceptionOfJobError(error: string | undefined): Exception {
  const [, type = "Error", message = ""] = uncaughtError.exec(error?.split("\n")[0] ?? "") ?? [];
  if (type === ReportableError.name) return { type, value: message, frames: [] };
  return { type, value: (type === "Error" && convexsOwnRefusal(message)) || unexpectedError, frames: [] };
}

function convexsOwnRefusal(message: string) {
  return convexsOwnRefusals.map((refusal) => refusal.exec(message)?.[0]).find((words) => words !== undefined);
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
