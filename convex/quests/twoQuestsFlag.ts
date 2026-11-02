import type { Flag } from "../analytics/flags";

export const twoQuestsFlag = { key: "two-quests", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
