import type { Flag } from "../analytics/flags.ts";

export const mondayQuestFlag = { key: "monday-quest", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
