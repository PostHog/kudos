import { useRef } from "react";
import { AppLink } from "../AppLink";
import { TeamCrest } from "../crates/TeamCrest";
import { TeamEmojiPicture } from "./TeamEmojiPicture";
import { PageTitle } from "../PageTitle";
import { MapInPlace, NotInSlack, useMapsInPlace, useSlackWay } from "./findInSlack";
import type { Album, AlbumEmoji, AlbumMe, AlbumPet, AlbumTeam, BookNext } from "./answer";
import { plural } from "./facts";
import { PersonPicture } from "./PersonPicture";
import { PetHoggie, petOf, petOwnerWordsOf } from "./PetHoggie";
import { hrefOf } from "./place";
import { LockedSeal, MissingTeammate, TeamProgressBar } from "./LockedTeam";
import { SealArt, sealSize } from "./Seal";
import { ShareLink } from "./ShareLink";
import { Silhouette } from "./Silhouette";
import { dateOf, nameOnThePhoto, onThePhotoOf, teamEmojiOf, teamEmojiUseWords, type OnThePhoto } from "./teamPage";
import type { TeamUnlocking } from "./useTeamUnlock";
import { LandedHype, NewLabel } from "./ItemBoard";
import { landedMarksOf, useBroughtIntoViewOnLanding, useLandedSticker, useLanding } from "./useItemBoard";
import { NewSinceTheLastVisit, useNewSinceTheLastVisit } from "./newLabels";
import "./team.css";

export function TeamPage({ album, team, unlocking }: { album: Album; team: AlbumTeam; unlocking: TeamUnlocking }) {
  const onThePhoto = onThePhotoOf(album, team);
  const emoji = teamEmojiOf(album, team.team);
  const mapsInPlace = useMapsInPlace();
  const unlocked = team.state === "unlocked";
  const emojiShown = unlocked || mapsInPlace;
  const locked = lockedOf(album, team);
  return (
    <article className="al-page-body al-team-page">
      <header>
        <p className="al-eyebrow">{team.mine ? "Your team" : "Team page"}</p>
        <PageTitle tab={team.name} size="hero">
          {team.name}
        </PageTitle>
        <p className="al-lede">{plural(onThePhoto.length, "person", "people")}</p>
        <ShareLink album={album} page={{ kind: "team", team: team.team }} cardOf={`the ${team.name}`} />
      </header>
      {locked !== null && <TeamProgressBar album={album} team={team} bookNext={locked} />}
      <figure className="al-team-photo" aria-label={`${team.name} team photo`}>
        <ul className="al-photo" data-size={onThePhoto.length > 5 ? "many" : "few"}>
          {onThePhoto.map((shown) => (
            <PhotoPerson key={photoKeyOf(shown)} shown={shown} pet={petShownWith(album, shown)} locked={locked === null ? null : { album, team, bookNext: locked }} />
          ))}
        </ul>
        {locked === null ? <Seal team={team} emoji={emoji} unlocking={unlocking} /> : <LockedSeal album={album} team={team} bookNext={locked} />}
      </figure>
      <p role="status" aria-label="Unlocking the sticker" className="al-unlock-problem">
        {team.state === "ready" && unlocking.problem?.team === team.team ? problemWordsOf(unlocking.problem.reason, team) : ""}
      </p>
      {emojiShown && emoji !== undefined && (unlocked && album.board !== null ? <TeamEmojiActions emoji={emoji} emojiPage={album.emojiPage} /> : <TeamEmojiLine team={team} emoji={emoji} unlocked={unlocked} emojiPage={album.emojiPage} />)}
    </article>
  );
}

function lockedOf(album: Album, team: AlbumTeam): BookNext | null {
  return team.state === "progress" && team.total > 0 ? (album.bookNext ?? null) : null;
}

function photoKeyOf(shown: OnThePhoto) {
  if (shown.kind === "me") return `me:${shown.me.person}`;
  return shown.kind === "person" ? shown.person.person : `unmatched:${shown.name}`;
}

type ShownPet = { pet: AlbumPet; owner: string };

type LockedPhoto = { album: Album; team: AlbumTeam; bookNext: BookNext };

function petShownWith(album: Album, shown: OnThePhoto): ShownPet | null {
  if (shown.kind === "unmatched") return null;
  const { person, name } = shown.kind === "me" ? shown.me : shown.person;
  const pet = petOf(album, person);
  return pet === null ? null : { pet, owner: petOwnerWordsOf(album, person, name) };
}

function PhotoPerson({ shown, pet, locked }: { shown: OnThePhoto; pet: ShownPet | null; locked: LockedPhoto | null }) {
  const landing = useLanding();
  const landsHere = shown.kind === "person" && landing?.face.kind === "sticker" && landing.face.person === shown.person.person;
  if (shown.kind === "person" && locked !== null && !shown.person.held && !landsHere) {
    return (
      <MissingTeammate {...locked} person={shown.person}>
        {pet !== null && <PetHoggie pet={pet.pet} owner={pet.owner} className="al-photo-pet" />}
      </MissingTeammate>
    );
  }
  if (shown.kind === "me") return <MeOnThePhoto me={shown.me} pet={pet} />;
  if (shown.kind === "person") return <PersonOnThePhoto person={shown.person} pet={pet} />;
  return (
      <li className="al-photo-person" data-out="">
        <span className="al-photo-sticker" data-picture="grey" aria-hidden="true">
          <Silhouette name={shown.name} />
        </span>
        <span className="al-photo-name ph-no-capture">{shown.name}</span>{" "}
        <span className="al-photo-role">Not in Slack yet</span>
      </li>
  );
}

function MeOnThePhoto({ me: { name, face }, pet }: { me: AlbumMe; pet: ShownPet | null }) {
  return (
    <li className="al-photo-person" data-me="">
      <AppLink href={hrefOf({ kind: "profile" })} className="al-photo-link">
        <PersonPicture face={face} name={name} collected frame="al-photo-sticker" className="al-photo-face" />
        <span className="al-photo-name ph-no-capture">{name}</span> <span className="al-photo-role">You</span>
      </AppLink>
      {pet !== null && <PetHoggie pet={pet.pet} owner={pet.owner} className="al-photo-pet" />}
    </li>
  );
}

function PersonOnThePhoto({ person: { person, name, face, held, at }, pet }: { person: Extract<OnThePhoto, { kind: "person" }>["person"]; pet: ShownPet | null }) {
  const spot = useRef<HTMLLIElement>(null);
  const landing = useLandedSticker(person);
  useBroughtIntoViewOnLanding(spot, landing);
  return (
    <li ref={spot} className="al-photo-person" data-out={held ? undefined : ""} {...landedMarksOf(landing)}>
      <AppLink href={hrefOf({ kind: "person", person })} className="al-photo-link">
        <PersonPicture face={face} name={name} collected={held} frame="al-photo-sticker" className="al-photo-face" />
        <span className="al-photo-name ph-no-capture">{name}</span>{" "}
        <span className="sr-only">{held ? "In your album" : "Not in your album yet"}</span>
      </AppLink>
      <NewSinceTheLastVisit at={at} />
      <LandedHype landing={landing} />
      {pet !== null && <PetHoggie pet={pet.pet} owner={pet.owner} className="al-photo-pet" />}
    </li>
  );
}

function Seal({ team, emoji, unlocking }: { team: AlbumTeam; emoji: AlbumEmoji | undefined; unlocking: TeamUnlocking }) {
  const unlockedByTheTurn = useLanding()?.unlocked.teamStickers.find((sticker) => sticker.team === team.team);
  const unlockedSinceTheLastVisit = useNewSinceTheLastVisit(team.unlockedAt);
  const emojiName = emoji?.name ?? unlockedByTheTurn?.emoji;
  return (
    <div className="al-seal-spot">
      {team.state === "ready" ? (
        <UnlockSeal team={team} unlocking={unlocking} />
      ) : (
        <div className="al-seal" data-state={team.state} data-al-seal={team.team} role="img" aria-label={sealLabelOf(team)}>
          <SealArt team={team} coloured={team.state === "unlocked"} size={sealSize} />
        </div>
      )}
      {team.state === "unlocked" && (
        <p className="al-seal-tag">
          <span tabIndex={-1} data-al-unlocked="">
            Unlocked {dateOf(team.unlockedAt ?? 0)}
          </span>
          {emojiName !== undefined && <code className="ph-no-capture">:{emojiName}:</code>}
          {(unlockedByTheTurn !== undefined || unlockedSinceTheLastVisit) && <NewLabel />}
        </p>
      )}
    </div>
  );
}

function UnlockSeal({ team, unlocking }: { team: AlbumTeam; unlocking: TeamUnlocking }) {
  const sending = unlocking.sending === team.team;
  const unavailable = unlocking.sending !== null || unlocking.waits;
  const busyWords = busyWordsOf(sending, unlocking.waits);
  return (
    <button
      type="button"
      className="al-seal"
      data-state="ready"
      data-al-seal={team.team}
      aria-label={busyWords ?? `Ready to unlock the ${team.name} sticker`}
      aria-disabled={unavailable || undefined}
      onClick={unavailable ? undefined : () => unlocking.start(team.team)}
    >
      <SealArt team={team} coloured={false} size={sealSize} />
      <span className="al-seal-shimmer" aria-hidden="true" />
      <span className="al-seal-ribbon">{busyWords ?? "Ready to unlock"}</span>
    </button>
  );
}

function busyWordsOf(sending: boolean, waits: boolean) {
  if (sending) return "Unlocking…";
  return waits ? "Waiting for your cards to land…" : null;
}

function sealLabelOf(team: AlbumTeam) {
  return team.state === "unlocked" ? `${team.name} sticker, unlocked` : `${team.name} sticker, ${team.held} of ${team.total}`;
}

function problemWordsOf(reason: "refused" | "unreachable", team: AlbumTeam) {
  return reason === "refused" ? `The ${team.name} sticker couldn't be unlocked. Reload the page to see where it stands.` : "Couldn't reach HedgeHug. Try again.";
}

function TeamEmojiActions({ emoji, emojiPage }: { emoji: AlbumEmoji; emojiPage: string | null }) {
  return (
    <div className="al-emoji-actions ph-no-capture">
      <TeamEmojiAction emoji={emoji} emojiPage={emojiPage} />
    </div>
  );
}

function TeamEmojiAction({ emoji, emojiPage }: { emoji: AlbumEmoji; emojiPage: string | null }) {
  const inPlace = useMapsInPlace();
  return inPlace ? <MapInPlace emoji={emoji} /> : !emoji.inSlack && <NotInSlack emoji={emoji} emojiPage={emojiPage} />;
}

function TeamEmojiLine({ team, emoji, unlocked, emojiPage }: { team: AlbumTeam; emoji: AlbumEmoji; unlocked: boolean; emojiPage: string | null }) {
  const way = useSlackWay();
  return (
    <div className="al-emoji-line ph-no-capture">
      <span className="al-emoji-picture">
        <TeamEmojiPicture art={team.art} name={team.name} emoji={emoji} size={32} />
      </span>
      {unlocked ? (
        <p>
          You got the <code>:{emoji.name}:</code> team emoji. {teamEmojiUseWords(emoji, way)}
        </p>
      ) : (
        <p>
          The <code>:{emoji.name}:</code> team emoji unlocks with the sticker.
        </p>
      )}
      <TeamEmojiAction emoji={emoji} emojiPage={emojiPage} />
    </div>
  );
}
