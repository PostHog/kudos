# The E2E suite

Outside-in journeys for HedgeHug on [e2e](https://e2e.com), TypeScript on Playwright. The suite reaches the app only the way Slack and members do, so the same journeys run against any build of HedgeHug:

- signed Slack requests (events, slash commands, interactions) sent to the app's base URL;
- recording fakes of Slack's API and of PostHog, which the app calls instead of the real ones (`fakes/server.ts`, over `testing/fakeSlack.ts` and `testing/fakePostHog.ts`);
- the website, in a browser, which a journey signs in to through one call, `website.signIn(member)`.

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
| `KUDOS_FAKES_URL` | The fakes the app calls as Slack's Web API (`/api`), as Slack's OpenID issuer and as PostHog. |
| `KUDOS_SIGN_IN` | How a member signs in to the website. `slack-openid`, the default and today's only way, clicks the website's Slack button and the fakes, as Slack's issuer, send the browser straight back as the member the journey named. A target that signs in another way adds its mechanism to `website.ts`. |

`pnpm e2e` writes the local one itself, after building the website against the local backend and uploading it to the backend's static hosting. Another target, such as the rewrite, writes its own file outside the repository and runs `E2E_TARGET=<file> pnpm exec e2e run --config e2e/e2e.config.ts`; its app must reach the fakes.

A journey that switches a flag posts the new definitions to the fakes, which answer once the app has reloaded them: `startFakes({ flagsChanged })` takes how. The local target runs the PostHog component's refresh; a target whose app polls the fakes passes a `flagsChanged` that waits until it has.

## Coverage

`BEHAVIOURS.md` lists every user-facing behaviour and the journey that proves it.
