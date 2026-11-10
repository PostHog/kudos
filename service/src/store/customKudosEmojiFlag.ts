import type { Flag } from "../analytics/flags.ts";

export const customKudosEmojiFlag = { key: "custom-kudos-emoji", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;
