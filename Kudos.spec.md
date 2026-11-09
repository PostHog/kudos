# Kudos

Peer recognition for Slack on one Convex deployment per workspace; the product rules are spec issue #28.

## trust levels
- slack-request (outside): what anyone on the internet sends to the deployment's Slack routes, claiming to be Slack
- browser (outside): what anyone on the internet sends to the website's public functions, the sign-in routes and the static pages
- posthog-com (outside): what posthog.com's public team API returns to the daily company profiles sync
- session: a browser presenting a live Convex Auth session for an identity of the deployment's workspace, not yet known to be a member
- domain: the deployment's internal functions and the rows they keep
- operator: a maintainer running the project's scripts on their own machine

## entrances
- render manifest: a maintainer renders the Slack app manifest for the sandbox or the real app to install it
  handler: slack-app/render-manifest.ts
  trust: operator
  control: none — it reads only its two arguments and prints a manifest that holds no secret; it reaches no deployment
- run e2e: a maintainer or CI runs the E2E suite against today's app on a disposable local backend
  handler: e2e/local/run.ts
  trust: operator
  control: none — it starts its own local backend and fakes on loopback ports with fresh synthetic secrets, and reaches no other deployment
- action signIn: a browser starts a Slack sign-in, redeems the one-time code with its verifier, or refreshes a session
  handler: signIn in convex/auth.ts
  trust: browser
- action signOut: a browser ends its own session
  handler: signOut in convex/auth.ts
  trust: browser
  control: none — Convex Auth's own; it deletes only the caller's own session and its refresh tokens, and exposes nothing
- query isAuthenticated: a browser asks whether its token belongs to a session
  handler: isAuthenticated in convex/auth.ts
  trust: browser
  control: none — Convex Auth's own; it answers one boolean about the caller's own token and reads no member fact
- route GET /api/auth/signin/slack: a browser starts the Slack handshake; Convex Auth sets its HttpOnly state and nonce cookies and redirects to Slack
  handler: auth in convex/auth.ts
  trust: browser
  control: none — it writes only Convex Auth's handshake rows and cookies and redirects to Slack's issuer with the deployment's own workspace, scope and callback; it reads no member fact
- route GET /api/auth/callback/slack: Slack sends the browser back with a code and the state
  handler: auth in convex/auth.ts
  trust: browser
- route POST /api/auth/callback/slack: Slack posts the browser back with a code and the state
  handler: auth in convex/auth.ts
  trust: browser
- route GET /.well-known/openid-configuration: anyone reads the deployment's OpenID discovery document
  handler: auth in convex/auth.ts
  trust: browser
  control: none — public discovery metadata only, no member data and no secret
- route GET /.well-known/jwks.json: anyone reads the public keys that verify the deployment's session tokens
  handler: auth in convex/auth.ts
  trust: browser
  control: none — public keys only; the private key stays in JWT_PRIVATE_KEY
- route GET /healthz: anyone asks a copy of the service which commit it serves, whether its migrations are done and whether it is switched off
  handler: createApp in service/src/http/app.ts
  trust: browser
  control: none — it reads no row and no secret; it answers the commit the image was built from and two states
- route GET /admin/load: the operator holding HEDGEHUG_ADMIN_TOKEN reads a load's phase, its staged chunks, each entry's checkpoint and the reported -0 and NaN, never row content
  handler: createLoadControl in service/src/load/control.ts
  trust: browser
- route POST /admin/load: the operator holding HEDGEHUG_ADMIN_TOKEN stages one numbered chunk of a Convex snapshot ZIP into an empty database
  handler: createLoadControl in service/src/load/control.ts
  trust: browser
- route POST /admin/load/finish: the operator holding HEDGEHUG_ADMIN_TOKEN starts the load of the staged snapshot, or resumes a stopped one
  handler: createLoadControl in service/src/load/control.ts
  trust: browser
- route POST /admin/load/reset: the operator holding HEDGEHUG_ADMIN_TOKEN empties every table a load wrote, before the load is done
  handler: createLoadControl in service/src/load/control.ts
  trust: browser

## invariants
