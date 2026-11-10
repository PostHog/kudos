# The E2E suite

Outside-in journeys for HedgeHug on [e2e](https://e2e.com), TypeScript on Playwright. The suite reaches the app only the way Slack and members do, so the same journeys run against any build of HedgeHug:

- signed Slack requests (events, slash commands, interactions) sent to the app's base URL;
- recording fakes of Slack's API and of PostHog, which the app calls instead of the real ones (`fakes/server.ts`, over `testing/fakeSlack.ts` and `testing/fakePostHog.ts`);
- the website, in a browser, which a journey signs in to through one call, `website.signIn(member)`.

It imports nothing from `convex/`. Every journey makes its own synthetic members and messages, so journeys never share state.

The PostHog fake serves the flags production had when it was paused (`fakes/productionFlags.ts`), on for everyone, so journeys prove what production's members saw. `pnpm e2e` makes the local app load them before the first journey; another target loads them from `KUDOS_FAKES_URL` as it would from PostHog.

## Run it

`pnpm e2e` runs every journey against today's app on a disposable local Convex backend (`local/run.ts`): it starts the fakes, starts the backend on free ports with the fakes' URLs in its env, deploys, writes a target file and runs `e2e run` on it. Arguments after `--` go to `e2e run`, such as `pnpm e2e -- journeys/giving.e2e.ts`. The first run downloads the pinned local backend into `~/.cache/convex/binaries/`; a browser comes from `pnpm exec e2e-web install chromium`.

`pnpm e2e:rewrite` runs the journeys the rewrite passes against the rewrite (`local/rewrite.ts`): it starts a throwaway Postgres 18, the fakes, the service as its image runs it, and a stand-in for the hosting edge in front of the service (`local/edge.ts`), waits until `/healthz` says the migrations are done, writes a target file and runs `e2e run` on the supported list. Arguments after `--` go to `e2e run` in place of the list, such as `pnpm e2e:rewrite -- journeys/giving.e2e.ts`. Both runners stop everything they started, also when a journey fails or the run is interrupted.

### The rewrite's supported list

`rewrite/supported.txt` names the journeys the rewrite passes, one file per line, or `<file>:<line>` for one test of a file whose other tests it can't pass yet. Every pull request runs the list against the rewrite and every journey against today's app. A stack adds its domain's journeys once they pass: it appends the line, runs `pnpm e2e:rewrite`, and keeps both sides on a merge conflict. A journey only the rewrite can pass, such as `journeys/health.e2e.ts`, skips on today's app with the reason: it reads the target's kind.

## Targets

A target file is an env file that names the app and its fakes:

| Name | What |
| --- | --- |
| `KUDOS_TARGET_KIND` | Which app the target runs: `oracle`, today's app and the default, or `rewrite`. |
| `KUDOS_APP_URL` | The app's base URL, where Slack's requests and the website go. |
| `KUDOS_SLACK_SIGNING_SECRET` | The signing secret the app checks Slack's requests with. |
| `KUDOS_SLACK_WORKSPACE` | The Slack workspace id the app serves. |
| `KUDOS_SLACK_APP_ID` | The Slack app id that Slack's requests to the app carry. |
| `KUDOS_FAKES_URL` | The fakes the app calls as Slack's Web API (`/api`), as Slack's OpenID issuer and as PostHog. |
| `KUDOS_SIGN_IN` | How a member signs in to the website. `slack-openid`, the default and today's only way, clicks the website's Slack button and the fakes, as Slack's issuer, send the browser straight back as the member the journey named. `edge-header` is the rewrite's: the edge in front of it signs members in and passes the member's email in `x-auth-request-email`, so the browser opens the edge stand-in's sign-in path with the member's email, and the stand-in passes it on gated paths and drops any such header a client sends. A target that signs in another way adds its mechanism to `website.ts`. |
| `KUDOS_TIME_URL` | The app's time seam. Optional: it defaults to `KUDOS_APP_URL` plus `/testing/time`. |
| `KUDOS_TEST_SECRET` | The test-only secret the time seam asks for. A target without it runs no journey tagged `@time`. |
| `KUDOS_HOSTED` | `true` for an app on the hosting platform, behind its real edge and real Slack, as the promotion gate runs it. Such a target names no `KUDOS_FAKES_URL` and runs only journeys tagged `@sandbox`. |
| `KUDOS_EDGE_SIGN_IN_URL` | On a hosted target, the start of the URL its edge sends a visitor who hasn't signed in to, so a redirect anywhere else fails `journeys/sandbox.e2e.ts`. |

`pnpm e2e` writes the local one itself, after building the website against the local backend and uploading it to the backend's static hosting; `pnpm e2e:rewrite` writes the rewrite's. Another target writes its own file outside the repository and runs `E2E_TARGET=<file> pnpm exec e2e run --config e2e/e2e.config.ts`; its app must reach the fakes.

A journey that switches a flag posts the new definitions to the fakes, which answer once the app has reloaded them: `startFakes({ flagsChanged })` takes how. The local target runs the PostHog component's refresh; a target whose app polls the fakes passes a `flagsChanged` that waits until it has.

## Time

Journeys never sleep for the app's time. A journey tagged `@time` takes the `time` fixture (`time.ts`) and moves the app's clock forward (`advance`), runs one cron's job (`runCron`, by the cron ids in `time.ts`) or lets the jobs that came due run (`settle`). Each is a `POST` to `KUDOS_TIME_URL` with the `x-hedgehug-test-secret` header and a body of `{"advance": ms}`, `{"runCron": "<id>"}` or `{"settle": true}`, answered with `{"now": ms, "ran": [...]}`. Slack's clock is the app's: the driver signs and stamps what Slack sends with the app's time, and gives a new member a day that sits at noon by it.

`pnpm e2e` serves the seam for today's app itself (`local/clock.ts`). It moves the backend's clock with libfaketime (`sudo apt-get install faketime`, or `KUDOS_LIBFAKETIME` naming its `libfaketimeMT.so.1`): each advance restarts the backend on the same database and ports at the new offset, which also runs the jobs that came due and catches each cron up once. A journey relies on none of that: it calls `settle`, and `runCron` for the cron it needs. Run only the clock's journeys with `pnpm e2e -- --tag @time`, or leave them out with `--exclude-tag @time` where libfaketime isn't installed.

## The promotion gate

`.github/workflows/promote-production.yml` promotes a commit of main from the sandbox to production. It runs the journeys tagged `@sandbox` against the hosted sandbox, and after production moves, those of them not tagged `@writes` against production. A hosted target sets `KUDOS_HOSTED=true` and names no fakes and no time secret, so a journey tagged `@sandbox` drives the app only through its public paths and Slack's signed requests: it never asks the fakes, moves the clock or signs in. A journey that only a hosted edge can pass, such as `journeys/sandbox.e2e.ts`, skips elsewhere and says why. A journey that writes to a hosted app, such as a kudos in the sandbox's own channel, also carries `@writes`.

The workflow runs nothing until the repository variable `HEDGEHUG_PROMOTION` is set: `sandbox` runs the gate and leaves production alone, `production` also fast-forwards the `production` branch to the commit the gate passed on, never back and never creating it. The steps are `tools/release/promote.ts`.

## Coverage

`BEHAVIOURS.md` lists every user-facing behaviour and the journey that proves it.
