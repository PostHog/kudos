export const postHogHost = "https://posthog.test";
export const projectToken = "phc_test_project_token";
export const flagsKey = "phs_test_flags_key";

export type CapturedEvent = {
  event: string;
  distinct_id: string;
  uuid: string;
  timestamp: string;
  properties: Record<string, unknown>;
};

export type BatchRequest = {
  url: string;
  body: string;
  apiKey: unknown;
  events: CapturedEvent[];
  startedAt: number;
  endedAt?: number;
  status?: number;
};

export type FlagDefinition = {
  key: string;
  active?: boolean;
  filters: {
    groups: Array<{ properties?: Array<Record<string, unknown>>; rollout_percentage?: number; variant?: string | null }>;
    multivariate?: { variants: Array<{ key: string; rollout_percentage: number }> } | null;
  };
};

type Answer = (signal?: AbortSignal) => Response | Promise<Response>;

export const answersWith = (status: number): Answer => () => new Response(null, { status });

const realSetTimeout = globalThis.setTimeout;

export const answersAMomentLater: Answer = () => new Promise((resolve) => realSetTimeout(() => resolve(new Response(null, { status: 200 })), 0));

export const failsToConnect: Answer = () => {
  throw new TypeError("fetch failed");
};

export const neverAnswers: Answer = (signal) =>
  new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));

export function stallsUntilReleased() {
  let release: (response: Response) => void = () => {};
  const answer: Answer = () => new Promise<Response>((resolve) => (release = resolve));
  return { answer, release: () => release(new Response(null, { status: 200 })) };
}

export class FakePostHog {
  readonly requests: BatchRequest[] = [];
  private readonly scripted: Answer[] = [];
  private definitions: FlagDefinition[] = [];
  private readonly scriptedDefinitions: Answer[] = [];
  /** Requests for the flags' definitions, whatever they were answered. */
  definitionRequests = 0;

  answering(...answers: Answer[]) {
    this.scripted.push(...answers);
    return this;
  }

  withFlags(...definitions: FlagDefinition[]) {
    this.definitions = definitions;
    return this;
  }

  /** Scripts the next answers of the definitions endpoint; once they run out, it serves the flags again. */
  answeringDefinitions(...answers: Answer[]) {
    this.scriptedDefinitions.push(...answers);
    return this;
  }

  /** What the definitions endpoint serves: the flags `withFlags` set, in PostHog's shape. */
  definitionsBody() {
    const flags = this.definitions.map((definition, index) => ({
      id: index + 1,
      name: definition.key,
      deleted: false,
      active: true,
      ensure_experience_continuity: false,
      ...definition,
    }));
    return { flags, group_type_mapping: {}, cohorts: {} };
  }

  events() {
    return this.requests.flatMap((request) => request.events);
  }

  productEvents() {
    return this.events().filter((event) => !isPersonEvent(event));
  }

  personEvents() {
    return this.events().filter(isPersonEvent);
  }

  personOf(distinctId: string) {
    const accepted = this.requests
      .filter(({ status }) => status !== undefined && status >= 200 && status < 300)
      .toSorted((first, second) => (first.endedAt ?? 0) - (second.endedAt ?? 0));
    const person: Record<string, unknown> = {};
    for (const { distinct_id, properties } of accepted.flatMap((request) => request.events).filter(isPersonEvent)) {
      if (distinct_id !== distinctId) continue;
      Object.assign(person, properties.$set);
      for (const key of (properties.$unset as string[] | undefined) ?? []) delete person[key];
    }
    return person;
  }

  owns(url: URL) {
    return url.origin === postHogHost;
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === "/flags/definitions") return this.flagDefinitions(url, new Headers(init?.headers), init?.signal ?? undefined);
    const body = String(init?.body ?? "");
    const parsed = JSON.parse(body) as { api_key: unknown; batch: CapturedEvent[] };
    const request: BatchRequest = { url: url.href, body, apiKey: parsed.api_key, events: parsed.batch, startedAt: Date.now() };
    this.requests.push(request);
    const answer = this.scripted.shift() ?? answersWith(200);
    try {
      const response = await answer(init?.signal ?? undefined);
      request.status = response.status;
      return response;
    } finally {
      request.endedAt = Date.now();
    }
  };

  private flagDefinitions(url: URL, headers: Headers, signal?: AbortSignal) {
    this.definitionRequests += 1;
    const authorized = url.searchParams.get("token") === projectToken && headers.get("authorization") === `Bearer ${flagsKey}`;
    if (!authorized) return answersWith(401)();
    const scripted = this.scriptedDefinitions.shift();
    return scripted ? scripted(signal) : Response.json(this.definitionsBody());
  }
}

export function withoutPersonProperties(body: string) {
  const parsed = JSON.parse(body) as { batch: CapturedEvent[] };
  for (const { properties } of parsed.batch.filter(isPersonEvent)) {
    delete properties.$set;
    delete properties.$unset;
  }
  return JSON.stringify(parsed);
}

function isPersonEvent({ event }: Pick<CapturedEvent, "event">) {
  return event === "$identify" || event === "$set";
}

const realFetch = globalThis.fetch;

export function routedFetch(postHog: FakePostHog, otherwise: typeof fetch) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.protocol === "data:") return realFetch(input, init);
    return postHog.owns(url) ? postHog.fetch(input, init) : otherwise(input, init);
  };
}
