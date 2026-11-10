import type { Flag } from "../analytics/flags.ts";

export const questsFlag = { key: "quests", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
