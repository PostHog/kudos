import { z } from "zod";

export const visitSourceParam = "src";

export const visitSourceValidator = z.union([
  z.literal("welcome"),
  z.literal("monday-dm"),
  z.literal("recap"),
  z.literal("app-home"),
  z.literal("reply"),
  z.literal("monday-post"),
  z.literal("link-card"),]
);

export type VisitSource = z.infer<typeof visitSourceValidator>;

export type Website = { origin: string; source: VisitSource };

const visitSources: readonly VisitSource[] = visitSourceValidator.options.map(({ value }) => value);

export function visitSourceIn(param: string | null): VisitSource | undefined {
  return visitSources.find((source) => source === param);
}

export function websiteAt(origin: string | null, source: VisitSource): Website | null {
  return origin === null ? null : { origin, source };
}

export function linkFrom(source: VisitSource, url: string): string {
  const address = new URL(url);
  address.searchParams.set(visitSourceParam, source);
  return address.toString();
}
