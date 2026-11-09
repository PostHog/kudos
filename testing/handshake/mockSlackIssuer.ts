import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { SlackOpenId, type NextSignIn } from "../slackOpenId.ts";

export type { NextSignIn } from "../slackOpenId.ts";

export const mockPort = Number(process.env.MOCK_SLACK_PORT ?? 3412);
export const issuer = `http://127.0.0.1:${mockPort}`;
export const allowedWorkspace = "TALLOWED";
const onForEveryone = { groups: [{ properties: [], rollout_percentage: 100 }] };

export class MockSlackIssuer {
  private readonly directory = new Map<string, { team_id: string; deleted?: boolean; tz?: string }>([
    ["U_JUNO", { team_id: allowedWorkspace, tz: "Europe/Berlin" }],
    ["U_GONE", { team_id: allowedWorkspace, deleted: true }],
  ]);
  private readonly openId = new SlackOpenId(issuer, { team: allowedWorkspace, user: "U_JUNO", name: "Juno Whitlock" });
  private websiteOpen = true;
  private readonly alsoOn = (process.env.MOCK_FLAGS_ON ?? "").split(",").filter((key) => key !== "");
  readonly usersInfoCalls: string[] = [];
  private readonly homes = new Map<string, unknown>();

  signsInNext(who: NextSignIn) {
    this.openId.signsInNext(who);
  }

  switchWebsite(open: boolean) {
    this.websiteOpen = open;
  }

  start() {
    const server = createServer((request, response) => void this.route(request, response));
    return new Promise<() => Promise<void>>((resolve, reject) => {
      server.once("error", reject);
      server.listen(mockPort, "127.0.0.1", () => resolve(() => new Promise((closed) => server.close(() => closed()))));
    });
  }

  private async route(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", issuer);
    const text = await body(request);
    if (url.pathname === "/control/next") return json(response, this.signsInNext(JSON.parse(text)));
    if (url.pathname === "/control/website") return json(response, this.switchWebsite(JSON.parse(text).open));
    const asIssuer = this.openId.answer(url, { headers: headersOf(request), body: text });
    if (asIssuer !== undefined) return send(response, await asIssuer);
    if (url.pathname === "/api/users.info") return this.usersInfo(url, response);
    if (url.pathname === "/flags/definitions") return this.serveFlagDefinitions(request, response);
    if (url.pathname === "/api/views.publish") return json(response, this.publishHome(JSON.parse(text)));
    if (url.pathname === "/control/home") return json(response, this.homes.get(url.searchParams.get("user") ?? "") ?? null);
    if (url.pathname.startsWith("/api/")) return json(response, { ok: true });
    json(response, { status: 1 });
  }

  private usersInfo(url: URL, response: ServerResponse) {
    const user = url.searchParams.get("user") ?? "";
    this.usersInfoCalls.push(user);
    const known = this.directory.get(user);
    if (known === undefined) return json(response, { ok: false, error: "user_not_found" });
    json(response, { ok: true, user: { id: user, ...known } });
  }

  private publishHome({ user_id, view }: { user_id: string; view: unknown }) {
    this.homes.set(user_id, view);
    return { ok: true };
  }

  private serveFlagDefinitions(request: IncomingMessage, response: ServerResponse) {
    const definitions = JSON.stringify(this.flagDefinitions());
    const etag = `"${createHash("sha256").update(definitions).digest("hex")}"`;
    if (request.headers["if-none-match"] === etag) return response.writeHead(304, { etag }).end();
    response.writeHead(200, { "content-type": "application/json", etag }).end(definitions);
  }

  private flagDefinitions() {
    const flags = [
      { key: "website", active: this.websiteOpen },
      ...this.alsoOn.map((key) => ({ key, active: true })),
    ].map(({ key, active }, index) => ({ id: index + 1, key, name: key, deleted: false, active, ensure_experience_continuity: false, filters: onForEveryone }));
    return { flags, group_type_mapping: {}, cohorts: {} };
  }
}

function body(request: IncomingMessage) {
  return new Promise<string>((resolve) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk)).on("end", () => resolve(text));
  });
}

function json(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
}

function headersOf(request: IncomingMessage) {
  return new Headers(Object.entries(request.headers).flatMap(([name, value]) => (typeof value === "string" ? [[name, value] as [string, string]] : [])));
}

async function send(response: ServerResponse, reply: Response) {
  response.writeHead(reply.status, Object.fromEntries(reply.headers)).end(await reply.text());
}
