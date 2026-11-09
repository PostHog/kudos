# The E2E suite

Outside-in journeys for HedgeHug on [e2e](https://e2e.com), TypeScript on Playwright. The suite reaches the app only the way Slack and members do, so the same journeys run against any build of HedgeHug:

- signed Slack requests (events, slash commands, interactions) sent to the app's base URL;
- recording fakes of Slack's API and of PostHog, which the app calls instead of the real ones (`fakes/server.ts`, over `testing/fakeSlack.ts` and `testing/fakePostHog.ts`);
- the website, in a browser.

It imports nothing from `convex/`. Every journey makes its own synthetic members and messages, so journeys never share state.

The PostHog fake serves the flags production had when it was paused (`fakes/productionFlags.ts`), on for everyone, so journeys prove what production's members saw. `pnpm e2e` makes the local app load them before the first journey; another target loads them from `KUDOS_FAKES_URL` as it would from PostHog.

## Run it

`pnpm e2e` runs every journey against today's app on a disposable local Convex backend (`local/run.ts`): it starts the fakes, starts the backend on free ports with the fakes' URLs in its env, deploys, writes a target file and runs `e2e run` on it. Arguments after `--` go to `e2e run`, such as `pnpm e2e -- journeys/giving.e2e.ts`. The first run downloads the pinned local backend into `~/.cache/convex/binaries/`; a browser comes from `pnpm exec e2e-web install chromium`.

## Targets

A target file is an env file that names the app and its fakes:

| Name | What |
| --- | --- |
| `KUDOS_APP_URL` | The app's base URL, where Slack's requests and the website go. |
| `KUDOS_SLACK_SIGNING_SECRET` | The signing secret the app checks Slack's requests with. |
| `KUDOS_SLACK_WORKSPACE` | The Slack workspace id the app serves. |
| `KUDOS_SLACK_APP_ID` | The Slack app id that Slack's requests to the app carry. |
| `KUDOS_FAKES_URL` | The fakes the app calls as Slack's Web API (`/api`) and as PostHog. |
| `KUDOS_TIME_URL` | The app's time seam. Optional: it defaults to `KUDOS_APP_URL` plus `/testing/time`. |
| `KUDOS_TEST_SECRET` | The test-only secret the time seam asks for. A target without it runs no journey tagged `@time`. |

`pnpm e2e` writes the local one itself. Another target, such as the rewrite, writes its own file outside the repository and runs `E2E_TARGET=<file> pnpm exec e2e run --config e2e/e2e.config.ts`; its app must reach the fakes.

## Time

Journeys never sleep for the app's time. A journey tagged `@time` takes the `time` fixture (`time.ts`) and moves the app's clock forward (`advance`), runs one cron's job (`runCron`, by the cron ids in `time.ts`) or lets the jobs that came due run (`settle`). Each is a `POST` to `KUDOS_TIME_URL` with the `x-hedgehug-test-secret` header and a body of `{"advance": ms}`, `{"runCron": "<id>"}` or `{"settle": true}`, answered with `{"now": ms, "ran": [...]}`. Slack's clock is the app's: the driver signs and stamps what Slack sends with the app's time, and gives a new member a day that sits at noon by it.

`pnpm e2e` serves the seam for today's app itself (`local/clock.ts`). It moves the backend's clock with libfaketime (`sudo apt-get install faketime`, or `KUDOS_LIBFAKETIME` naming its `libfaketimeMT.so.1`): each advance restarts the backend on the same database and ports at the new offset, which also runs the jobs that came due and catches each cron up once. A journey relies on none of that: it calls `settle`, and `runCron` for the cron it needs. Run only the clock's journeys with `pnpm e2e -- --tag @time`, or leave them out with `--exclude-tag @time` where libfaketime isn't installed.

## Coverage

`BEHAVIOURS.md` lists every user-facing behaviour and the journey that proves it.
