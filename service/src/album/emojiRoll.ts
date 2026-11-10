export type EmojiRollInput = { secret: string; member: string; crate: string };

export type EmojiRoll = { chance: number; pick: number };

export async function emojiRollOf({ secret, member, crate }: EmojiRollInput): Promise<EmojiRoll> {
  const digest = new DataView(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${member}:${crate}:random-emoji`)));
  return { chance: fractionAt(digest, 0), pick: fractionAt(digest, 4) };
}

function fractionAt(digest: DataView, offset: number) {
  return digest.getUint32(offset) / 2 ** 32;
}
