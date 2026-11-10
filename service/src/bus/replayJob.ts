// The operator's replay of one failed subscriber job, as `npx convex run bus/replay:replay '{"job": …}'` is today. Run it
// where the service's DATABASE_URL is set, in the service's image: `node src/bus/replayJob.ts <job id>`. It prints what
// the replay answered: replayed, not failed, not a subscriber, or already replayed.
import { createClock } from "../clock.ts";
import { createPool } from "../db/pool.ts";
import { jsonLog } from "../log.ts";
import { createOperations } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import { replay } from "./replay.ts";

const usage = "Usage: node src/bus/replayJob.ts <job id>, with DATABASE_URL set";

if (import.meta.main) {
  const [job] = process.argv.slice(2);
  const databaseUrl = process.env.DATABASE_URL;
  if (!job || !databaseUrl) {
    console.error(usage);
    process.exit(2);
  }
  const pool = createPool(databaseUrl);
  try {
    const operations = createOperations({ pool, clock: createClock(), log: jsonLog(), subscribers: serviceRegistry.subscribers });
    console.log(await operations.mutation("bus.replay.replay", (ctx) => replay(ctx, serviceRegistry, { job })));
  } finally {
    await pool.end();
  }
}
