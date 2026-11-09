import { exportJWK, generateKeyPair, SignJWT } from "jose";

// A stand-in for Slack's OpenID Connect issuer: discovery, an authorize step that sends the browser straight back as
// whoever signs in next, the token endpoint and its signing keys. The handshake suite and the E2E fakes both serve it.

export const clientId = "mock-client";
export const clientSecret = "mock-client-secret";

export type NextSignIn = { team: string; user: string; name?: string; wrongNonce?: boolean; wrongAudience?: boolean };

type Grant = NextSignIn & { nonce: string; redirectUri: string };

const keys = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(keys.publicKey)), kid: "mock", alg: "RS256", use: "sig" };

export class SlackOpenId {
  private readonly grants = new Map<string, Grant>();
  private next: NextSignIn;
  readonly issuer: string;

  constructor(issuer: string, first: NextSignIn) {
    this.issuer = issuer;
    this.next = first;
  }

  signsInNext(who: NextSignIn) {
    this.next = who;
  }

  // Answers the issuer's own paths, and nothing for any other path.
  answer(url: URL, request: { headers: Headers; body: string }): Promise<Response> | undefined {
    if (url.pathname === "/.well-known/openid-configuration") return Promise.resolve(Response.json(this.discovery()));
    if (url.pathname === "/openid/connect/authorize") return Promise.resolve(this.authorize(url));
    if (url.pathname === "/api/openid.connect.token") return this.token(new URLSearchParams(request.body), request.headers);
    if (url.pathname === "/jwks") return Promise.resolve(Response.json({ keys: [jwk] }));
    return undefined;
  }

  private discovery() {
    const issuer = this.issuer;
    return {
      issuer,
      authorization_endpoint: `${issuer}/openid/connect/authorize`,
      token_endpoint: `${issuer}/api/openid.connect.token`,
      userinfo_endpoint: `${issuer}/api/openid.connect.userInfo`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "email"],
    };
  }

  private authorize(url: URL) {
    const code = crypto.randomUUID();
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    this.grants.set(code, { ...this.next, nonce: url.searchParams.get("nonce") ?? "", redirectUri });
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    const state = url.searchParams.get("state");
    if (state !== null) back.searchParams.set("state", state);
    return new Response(null, { status: 302, headers: { location: back.toString() } });
  }

  private async token(form: URLSearchParams, headers: Headers) {
    const [id, secret] = basicCredentials(headers) ?? [form.get("client_id"), form.get("client_secret")];
    if (id !== clientId || secret !== clientSecret) return Response.json({ ok: false, error: "invalid_client" }, { status: 401 });
    const code = form.get("code") ?? "";
    const grant = this.grants.get(code);
    this.grants.delete(code);
    if (grant === undefined || grant.redirectUri !== form.get("redirect_uri")) return Response.json({ ok: false, error: "invalid_code" }, { status: 400 });
    return Response.json({ ok: true, access_token: "xoxp-mock", token_type: "Bearer", id_token: await this.idTokenOf(grant) });
  }

  private idTokenOf(grant: Grant) {
    return new SignJWT({
      nonce: grant.wrongNonce ? "not-the-nonce-you-sent" : grant.nonce,
      "https://slack.com/team_id": grant.team,
      "https://slack.com/user_id": grant.user,
      ...(grant.name && { name: grant.name }),
    })
      .setProtectedHeader({ alg: "RS256", kid: "mock" })
      .setIssuer(this.issuer)
      .setAudience(grant.wrongAudience ? "another-client" : clientId)
      .setSubject(grant.user)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(keys.privateKey);
  }
}

function basicCredentials(headers: Headers) {
  const header = headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;
  return Buffer.from(header.slice(6), "base64").toString().split(":").map(decodeURIComponent);
}
