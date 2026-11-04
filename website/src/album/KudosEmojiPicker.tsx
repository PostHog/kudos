import { useId, useState, type ReactNode } from "react";
import { firstThankYouEmoji, mostKudosEmojiPicks } from "../../../convex/album/emojiCatalogue";
import type { Album, PickKudosEmoji } from "./answer";
import { EmojiPicture } from "./EmojiPicture";
import { picksKudosEmojis, usableNowOf } from "./emojiShelf";

type Reply = { to: Album["kudosEmojiPicks"]; picks: string[] };

type PickerProps = { album: Album; pickKudosEmoji: PickKudosEmoji; Heading?: "h2" | "h3" };

export function KudosEmojiPicker({ album, pickKudosEmoji, Heading = "h2" }: PickerProps) {
  const heading = useId();
  const [replied, setReplied] = useState<Reply | null>(null);
  const [sending, setSending] = useState(false);
  const pickable = usableNowOf(album.emojis).filter(({ id, kind }) => id !== firstThankYouEmoji && kind !== "hype");
  if (!picksKudosEmojis(album)) return null;
  const read = album.kudosEmojiPicks;
  const picked = new Set(replied !== null && replied.to === read ? replied.picks : (read ?? []));
  const unlisted = [...picked].filter((id) => !pickable.some((emoji) => emoji.id === id));
  if (pickable.length === 0 && unlisted.length === 0) return null;
  const full = picked.size >= mostKudosEmojiPicks;
  const toggle = async (id: string) => {
    setSending(true);
    const reply = await pickKudosEmoji(id, !picked.has(id)).catch(() => null);
    if (reply?.kind === "picked") setReplied({ to: read, picks: reply.picks });
    setSending(false);
  };
  return (
    <section className="al-emoji-shelf" aria-labelledby={heading}>
      <Heading id={heading} className="al-emoji-panel-title">
        Count in kudos{" "}
        <span className="al-quiet">
          · {picked.size} of {mostKudosEmojiPicks}
        </span>
      </Heading>
      <p className="al-emoji-panel-hint">{alwaysCountingWords(album)} Pick up to {mostKudosEmojiPicks} more for the kudos you write. A teammate's hype emoji counts when you mention them, and a reaction with any emoji is a hug.</p>
      <ul className="al-kudos-picks">
        {pickable.map((emoji) => (
          <li key={emoji.id}>
            <button type="button" className="al-kudos-pick" aria-pressed={picked.has(emoji.id)} disabled={sending || (full && !picked.has(emoji.id))} onClick={() => void toggle(emoji.id)}>
              <EmojiPicture emoji={emoji} size={24} />
              <code className="al-emoji-code ph-no-capture">:{emoji.name}:</code>
            </button>
          </li>
        ))}
        {unlisted.map((id) => (
          <li key={id}>
            <button type="button" className="al-kudos-pick" aria-pressed disabled={sending} onClick={() => void toggle(id)}>
              <UnlistedPick id={id} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UnlistedPick({ id }: { id: string }) {
  const [kind, name] = id.split(":", 2);
  if (kind !== "random" || name === undefined) return "An emoji no longer listed";
  return (
    <>
      <code className="al-emoji-code ph-no-capture">:{name}:</code> <span className="al-quiet">No longer listed</span>
    </>
  );
}

function alwaysCountingWords({ emojis }: Album): ReactNode {
  const firstThankYou = emojis.find(({ id, earned }) => id === firstThankYouEmoji && earned);
  if (firstThankYou === undefined) return "Your kudos emoji always counts.";
  return (
    <>
      Your kudos emoji and <code className="al-emoji-code ph-no-capture">:{firstThankYou.name}:</code> always count.
    </>
  );
}
