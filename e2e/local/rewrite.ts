// `pnpm e2e:rewrite` runs the journeys on the rewrite's supported list (../rewrite/supported.txt) against the rewrite:
// the service on a throwaway Postgres, behind the edge stand-in (rewriteTarget.ts). Arguments after `--` go to `e2e run`
// in place of the list, so a stack runs a journey before it joins the list. The journeys run on the oracle's own data,
// loaded from its export (./oracleCopy.ts) as the move loads production's.
import { runRig } from "./rig.ts";
import { oracleExport } from "./oracleCopy.ts";
import { startRewrite, supportedJourneys } from "./rewriteTarget.ts";

await runRig(async (rig) => {
  // The rewrite starts as the move leaves it: empty, then loaded from today's app's export, round-tripped and recovered.
  const rewrite = await startRewrite(rig.signal, { load: oracleExport });
  rig.defer(rewrite.stop);
  console.log(`the rewrite answers at ${rewrite.serviceUrl} behind the edge stand-in at ${rewrite.appUrl}, its target file in ${rewrite.folder}`);
  const asked = process.argv.slice(2).filter((argument) => argument !== "--");
  const exitCode = await rig.runJourneys(rewrite.targetFile, asked.length > 0 ? asked : supportedJourneys());
  if (exitCode !== 0 && !rig.interrupted()) console.error(`the service's log:\n${rewrite.serviceOutput()}`);
  return exitCode;
});
