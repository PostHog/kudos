import type { Flag } from "../analytics/flags.ts";

export const achievementsFlag = { key: "achievements", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
