# The E2E suite

Outside-in journeys for HedgeHug on [e2e](https://e2e.com), TypeScript on Playwright. The suite reaches the app only the way Slack and members do, so the same journeys run against any build of HedgeHug:

- signed Slack requests (events, slash commands, interactions) sent to the app's base URL;
- recording fakes of Slack's API and of PostHog, which the app calls instead of the real ones (`fakes/server.ts`, over `testing/fakeSlack.ts` and `testing/fakePostHog.ts`);
- the website, in a browser.

It imports nothing from `convex/`. Every journey makes its own synthetic members and messages, so journeys never share state.

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

`pnpm e2e` writes the local one itself. Another target, such as the rewrite, writes its own file outside the repository and runs `E2E_TARGET=<file> pnpm exec e2e run --config e2e/e2e.config.ts`; its app must reach the fakes.

## Coverage

`BEHAVIOURS.md` lists every user-facing behaviour and the journey that proves it.
