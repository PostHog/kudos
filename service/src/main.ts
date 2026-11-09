// The image's entrypoint.
import { boot } from "./boot.ts";
import { errorName, jsonLog } from "./log.ts";

const log = jsonLog();
const service = await boot({ env: process.env, log });

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log.info("stopping", { signal });
    service.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        log.error("stop failed", { error: errorName(error) });
        process.exit(1);
      },
    );
  });
}
