// Run by the image build: writes the checkout's HEAD commit to the file the service reads at boot.
// Usage: node service/scripts/write-commit.ts <checkout>
import { writeFileSync } from "node:fs";
import { commitFile, gitHead } from "../src/commit.ts";

const commit = process.env.HEDGEHUG_COMMIT || gitHead(process.argv[2] ?? ".");
writeFileSync(commitFile, `${commit}\n`);
console.log(`commit ${commit}`);
