import type { CSSProperties } from "react";
import type { TurnedFaceShown } from "../../../convex/website/album";
import { metalOf } from "../book/metal";
import { EmojiPicture } from "./EmojiPicture";
import { HoggieArt } from "./HoggieArt";
import { LadderEmblem } from "../book/LadderEmblem";
import { emblemOf, medalWordsOf, milestoneNameOf, tierWordOf } from "./milestones";
import { stepNameOf } from "../../../convex/album/milestoneCatalogue";
import { rarityWordOf } from "./opening";
import { Confetti, Sparkles } from "./PackCards";
import { PersonPicture } from "./PersonPicture";
import type { Chip, EmojiUp, Flight, FlightBoxes, MedalShow, MedalXpChip } from "./useTurnFlight";

export function TurnFlight({ flight, boxes }: { flight: Flight; boxes: FlightBoxes }) {
  const { face } = flight;
  return (
    <>
      <div className="ib-air" aria-hidden="true">
        <Flyer flight={flight} boxes={boxes} />
        {flight.burst && face !== null && <Burst flight={flight} face={face} />}
        {flight.caption && face !== null && <Caption flight={flight} face={face} />}
        {flight.chip !== null && <XpChip chip={flight.chip} />}
        {flight.rings !== null && face !== null && <Rings rect={flight.rings} face={face} />}
        {flight.flourish !== null && <GoldFlourish rect={flight.flourish} />}
        {flight.medal !== null && <MedalStage medal={flight.medal} picture={boxes.medal} />}
        {flight.medalXp !== null && <MedalXp chip={flight.medalXp} />}
        {flight.emoji !== null && <EmojiSpring up={flight.emoji} picture={boxes.emoji} />}
        {flight.stage !== "back" && <p className="ib-skip">Click to skip</p>}
      </div>
      <p role="status" aria-label="Identifying" className="al-sr ph-no-capture">
        {saidOf(flight)}
      </p>
    </>
  );
}

function Flyer({ flight: { from, face }, boxes }: { flight: Flight; boxes: FlightBoxes }) {
  return (
    <div ref={boxes.flyer} className="ib-flyer" style={{ left: from.left, top: from.top, width: from.width, height: from.height, "--burst": face === null ? "var(--al-accent)" : colourOf(face) } as CSSProperties}>
      <div ref={boxes.flip} className="ib-flip">
        <div className="ib-face">
          <span className="ib-back">
            <span className="ib-q">?</span>
          </span>
        </div>
        <div className="ib-face ib-front-face">
          <span className="ib-front" data-kind={face?.kind}>
            <span ref={boxes.disc} className="ib-disc" />
            {face !== null && <FrontArt face={face} />}
          </span>
        </div>
      </div>
    </div>
  );
}

function FrontArt({ face }: { face: TurnedFaceShown }) {
  if (face.kind === "hoggie") return <HoggieArt hoggie={face.drop.hoggie} hidden={false} />;
  return <PersonPicture face={face.thanked.face} name={face.thanked.name ?? ""} collected frame="ib-sticker" className="ib-sticker-face" />;
}

function Burst({ flight: { spot, size }, face }: { flight: Flight; face: TurnedFaceShown }) {
  const rare = face.kind === "hoggie" && face.drop.rarity !== "common" && face.drop.rarity !== "uncommon";
  return (
    <span className="ib-burst" data-rare={rare ? "" : undefined} style={{ left: spot.x, top: spot.y, width: size, height: size, "--burst": colourOf(face), "--rarity-color": colourOf(face) } as CSSProperties}>
      <span className="ib-rays" />
      <span className="ib-flash" />
      <Sparkles count={rare ? 18 : 10} seed={size} />
    </span>
  );
}

function Caption({ flight: { spot, size }, face }: { flight: Flight; face: TurnedFaceShown }) {
  return (
    <span className="ib-caption ph-no-capture" style={{ left: spot.x, top: spot.y + size / 2 + 14, "--burst": colourOf(face) } as CSSProperties}>
      <strong className="ib-caption-name">{nameOf(face)}</strong>
      <span className="ib-caption-what">{whatOf(face)}</span>
    </span>
  );
}

function XpChip({ chip: { xp, from, to } }: { chip: Chip }) {
  const middle = { x: (from.x + to.x) / 2 + 40, y: Math.min(from.y, to.y) - 60 };
  return (
    <span className="ib-chip" style={{ left: from.x, top: from.y, "--mx": `${middle.x - from.x}px`, "--my": `${middle.y - from.y}px`, "--dx": `${to.x - from.x}px`, "--dy": `${to.y - from.y}px` } as CSSProperties}>
      +{xp} XP
    </span>
  );
}

function Rings({ rect, face }: { rect: DOMRect; face: TurnedFaceShown }) {
  return (
    <span className="ib-rings" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, "--burst": colourOf(face) } as CSSProperties}>
      <span className="ib-ring" />
      <span className="ib-ring" data-late="" />
    </span>
  );
}

function GoldFlourish({ rect }: { rect: DOMRect }) {
  return (
    <span className="ib-burst ib-flourish" data-rare="" style={{ left: rect.left + rect.width / 2, top: rect.top + rect.height / 2, width: rect.width, height: rect.height, "--burst": "var(--al-gold)", "--rarity-color": "var(--al-gold)" } as CSSProperties}>
      <span className="ib-rays" />
      <span className="ib-flash" />
      <Sparkles count={20} seed={rect.width + rect.top} />
    </span>
  );
}

const sparklesByMetal = { bronze: 14, silver: 20, gold: 28, diamond: 36 } as const;

function MedalStage({ medal: { tier, xp, phase, centre, size, art }, picture }: { medal: MedalShow; picture: FlightBoxes["medal"] }) {
  const colour = metalOf(tier.tier);
  const stamped = phase === "stamped";
  const at = stamped ? { left: art.left + art.width / 2, top: art.top + art.height / 2, width: art.width, height: art.width } : { left: centre.x, top: centre.y, width: size, height: size };
  return (
    <span className="ib-medal-stage" data-phase={phase} data-metal={tier.tier} style={{ "--burst": colour } as CSSProperties}>
      <span className="ib-medal-scrim" />
      <span key={stamped ? "stamped" : "in"} className="ib-burst ib-medal-burst" data-rare="" data-metal={tier.tier} style={{ ...at, "--burst": colour, "--rarity-color": colour } as CSSProperties}>
        <span className="ib-medal-shine" />
        <span className="ib-rays" />
        <span className="ib-flash" />
        <span className="ib-ring" />
        <span className="ib-ring" data-late="" />
        <Sparkles count={sparklesByMetal[tier.tier]} seed={at.width + at.top} />
        {(tier.tier === "gold" || tier.tier === "diamond") && <Confetti size={tier.tier === "diamond" ? "gold" : "modest"} seed={at.left + at.top} />}
      </span>
      {!stamped && (
        <span ref={picture} className="ib-medal-big" style={{ left: centre.x, top: centre.y, width: size, height: size }}>
          <LadderEmblem ladder={emblemOf(tier.milestone)} best={tier.tier} size={size} />
        </span>
      )}
      <span className="ib-medal-title ph-no-capture" style={{ left: centre.x, top: centre.y + size / 2 + 18 }}>
        <span className="ib-medal-eyebrow">Medal unlocked</span>
        <strong className="ib-medal-name">{stepNameOf(tier.milestone, tier.tier)}</strong>
        <span className="ib-medal-metal">{`${tierWordOf(tier.tier)} · ${milestoneNameOf(tier.milestone)}`}</span>
        {xp > 0 && <span className="ib-medal-reward">{`+${xp} XP`}</span>}
      </span>
    </span>
  );
}

function MedalXp({ chip: { xp, tier, from, to } }: { chip: MedalXpChip }) {
  return (
    <span className="ib-medal-xp" data-metal={tier.tier} style={{ left: from.x, top: from.y, "--burst": metalOf(tier.tier), "--dx": `${to.x - from.x}px`, "--dy": `${to.y - from.y}px` } as CSSProperties}>
      <Sparkles count={sparklesByMetal[tier.tier]} seed={from.x + xp} />
      <span className="ib-medal-xp-count">{`+${xp} XP`}</span>
    </span>
  );
}

const springingEmojiSize = 64;

function EmojiSpring({ up: { emoji, at, flying }, picture }: { up: EmojiUp; picture: FlightBoxes["emoji"] }) {
  return (
    <span className="ib-emoji ph-no-capture" style={{ left: at.x, top: at.y }} data-flying={flying ? "" : undefined}>
      <span ref={picture} className="ib-emoji-picture">
        <Sparkles count={10} seed={at.x + at.y} />
        <EmojiPicture emoji={emoji} size={springingEmojiSize} />
      </span>
      <span className="ib-emoji-caption">
        <strong>:{emoji.name}:</strong>
        <span>New emoji</span>
      </span>
    </span>
  );
}

function saidOf({ caption, face, medal, medalXp, emoji }: Flight) {
  if (medalXp !== null) return `+${medalXp.xp} XP for ${medalWordsOf(medalXp.tier)}`;
  if (emoji !== null) return `:${emoji.emoji.name}: emoji unlocked`;
  if (medal !== null) return medal.xp > 0 ? `${medalWordsOf(medal.tier)} medal unlocked, +${medal.xp} XP` : `${medalWordsOf(medal.tier)} medal unlocked`;
  return caption && face !== null ? `${nameOf(face)}: ${whatOf(face)}` : "";
}

export function nameOf(face: TurnedFaceShown) {
  return face.kind === "hoggie" ? face.drop.name : (face.thanked.name ?? "Your teammate");
}

export function whatOf(face: TurnedFaceShown) {
  const fresh = face.kind === "hoggie" ? face.drop.isNew : face.isNew;
  const what = face.kind === "hoggie" ? `${rarityWordOf(face.drop.rarity)} hoggie` : "Sticker";
  return fresh ? `${what} · New` : what;
}

function colourOf(face: TurnedFaceShown) {
  return face.kind === "hoggie" ? `var(--rarity-${face.drop.rarity})` : "var(--al-accent)";
}
