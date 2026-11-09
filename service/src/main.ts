// The image's entrypoint.
import { boot } from "./boot.ts";
import { errorFields, jsonLog } from "./log.ts";

const log = jsonLog();
const service = await boot({ env: process.env, log });

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log.info("stopping", { signal });
    service.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        log.error("stop failed", errorFields(error));
        process.exit(1);
      },
    );
  });
}
