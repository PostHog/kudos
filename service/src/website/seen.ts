import type { MemberId } from "../workspace/directory.ts";

const keyLength = 32;

export async function seenKeyOf(member: MemberId, crate: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`seen:${member}:${crate}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, keyLength);
}
