# The oracle's export

`oracleExport.zip` is what today's app left after every E2E journey passed against it, exported with the move's tool
(`tools/move/export.ts`), which adds each namespace's `_scheduled_functions` to `convex export`'s ZIP.

- **App:** `convex/` at commit `bf668aa4470c731ab0155998737ca8b038d12e0b`, tree `fc2ee09abba822a712a9cc1b0ee8e42e37342da5`.
  This stands in for the `convex-oracle` tag until it exists. `convex/` is frozen, so `main`'s tree is the same until S20.
- **Made by:** the `e2e` job of Gate run 42819246522, its `oracle-export` artifact, trimmed with
  `node e2e/local/trimExport.ts <artifact>/oracleExport.zip`. The job now trims the export before it uploads it.
- **Trimmed:** the static hosting component's files, the website build, and the company directory (`companyProfiles`,
  `companyTeams`), which the oracle syncs from PostHog's public team pages and so names real people. Everything else
  is the journeys' own synthetic data.

To refresh it, take the `oracle-export` artifact of a green `e2e` run within the day it is kept, run the trim on it
(it is trimmed already; the trim changes nothing then), and update the lines above. `e2e/local/trimExport.test.ts`
checks the fixture holds no company directory.
`service/src/load/oracleExport.test.ts` proves the load, the round trip and recovery on it, and `pnpm e2e:rewrite` runs
the supported journeys on a copy loaded from it.
