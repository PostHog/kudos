import type { Flag } from "../analytics/flags.ts";

export const coinsFlag = { key: "coins", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
