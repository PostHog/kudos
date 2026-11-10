import type { Flag } from "../analytics/flags.ts";

export const skillTreeFlag = { key: "skill-tree", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
