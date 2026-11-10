import type { Flag } from "../analytics/flags.ts";

export const twoQuestsFlag = { key: "two-quests", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
