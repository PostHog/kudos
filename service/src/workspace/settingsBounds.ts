export const allowanceRange = { least: 1, most: 20 } as const;

export const hugBudgetRange = { least: 0, most: 50 } as const;

export function emojiNameOf(typed: string) {
  return typed.trim().toLowerCase().replace(/^:|:$/g, "");
}
