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
- change slack manifest: CI moves the sandbox Slack app to the manifest rendered for its app's URL on a push to main, and the production app only by a run started by hand that names it
  handler: tools/release/slackManifest.ts
  trust: operator
  control: none — maintainers start it by pushing to main or by hand, and it runs only while the repository variable HEDGEHUG_MANIFEST_UPDATES is set, for production only at `production`; it never drops a scope or an event, and sends nothing until the new events URL answers Slack's check signed with the app's secret
- run e2e: a maintainer or CI runs the E2E suite against today's app on a disposable local backend
  handler: e2e/local/run.ts
  trust: operator
  control: none — it starts its own local backend and fakes on loopback ports with fresh synthetic secrets, and reaches no other deployment
- promote to production: CI moves the production branch forward to a commit of main once the sandbox serves it and the journeys tagged @sandbox pass there
  handler: tools/release/promote.ts
  trust: operator
  control: none — maintainers start it by pushing to main, and it runs only while the repository variable HEDGEHUG_PROMOTION is set; it pushes only with that variable at `production`, and only a fast-forward of an existing production branch to the commit the gate passed on
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
- route POST /testing/time: the E2E suite moves the app's clock forward, runs a cron, or runs the due jobs on a local or CI copy of the service
  handler: mountTestingTime in service/src/http/app.ts
  trust: browser
  control: none — it is mounted only when HEDGEHUG_TEST_SECRET is set, which production and the sandbox never set, and a request whose x-hedgehug-test-secret doesn't match, compared in constant time, gets the 404 of an unknown path (service/src/http/testingTime.test.ts)
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
- route GET /*: a browser reads one of the website's built files, or its page for any address that names no file and isn't the API's
  handler: websiteFiles in service/src/website/hosting.ts
  trust: browser
  control: none — it answers only files of the build folder the image holds, looked up by name in a list read from that folder, never a path the request spells; it reads no row and no secret, and every HTML answer carries the policy of contentSecurityPolicy, which lets the page load only its own code
- route POST /api/query/*: the website reads one of the route table's reads, named by its former Convex path, for the member the request signs in as
  handler: apiTransport in service/src/website/api/transport.ts
  trust: browser
  control: none — a request without the x-hedgehug-api header, as anything but JSON, or marked cross-site by the browser gets 403, a body over 64 KiB gets 413, and arguments the route's shape refuses, an unknown field at any depth included, get 400, before anyone is looked up; the person is whoever the edge's single sign-on names by email in x-auth-request-email, which the app drops on every other path, mapped to a member through the directory or else Slack, and only a member today's check verifies reaches the read, while anyone else gets the check's denial (service/src/website/api/transport.test.ts, service/src/website/identity.test.ts)
- route POST /api/mutation/*: the website sends one of the route table's commands, named by its former Convex path, for the member the request signs in as
  handler: apiTransport in service/src/website/api/transport.ts
  trust: browser
  control: none — the same guard as the reads: no cross-site form or link can send the header or the JSON, so no other site runs a command; the person is the one the edge names, as for the reads, and only a member the website admits reaches the command, in one transaction that writes nothing on a denial (service/src/website/api/transport.test.ts, service/src/website/identity.test.ts)
- route POST /api/entry: the website signs the person in once per page load, running today's sign-in effects when they're due
  handler: apiTransport in service/src/website/api/transport.ts
  trust: browser
  control: none — the same guard as the reads and commands, and any argument gets 400, before anyone is looked up; the person is the one the edge names, as for the reads, and a closed website, a signed-out request or someone who isn't a member gets the denial and writes nothing, while the users row, the greeting and a verification are written only on a first entry or while the person is being verified (service/src/website/entry.test.ts)

## invariants
