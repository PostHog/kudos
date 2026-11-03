import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { IconCheck, IconChevronRight } from "@posthog/icons";
import type { DrawnQuest, GettingStartedStep, MondayQuests, SideQuest } from "../../../convex/website/quests";
import type { QuestsSurface } from "../shell";
import type { QuestsShown } from "./answer";
import { CardBack } from "./PackCards";
import { useQuestsFold, useViewedOnEachOpen, type FoldPlace, type QuestsLanding } from "./questsFold";
import "./quests.css";

export type ShellQuests = { quests: MondayQuests; inSight: boolean; openBoard: () => void; landing: QuestsLanding; view: (surface: QuestsSurface) => void };

type Row = { goal: string; hint: string | null; howToOpen: boolean; next: boolean; progress: { done: number; target: number }; done: boolean; reward: { xp: number } | null; boardLink: boolean };

export function mondayQuestsIn(shown: QuestsShown | undefined): MondayQuests | null {
  return shown?.kind === "monday" ? shown : null;
}

export function QuestsPanel({ shown, place }: { shown: ShellQuests; place: FoldPlace }) {
  const { open, fold, unfold, openHere } = useQuestsFold(place);
  const { tab, foldButton, toggled } = useFocusAcrossTheFold(open);
  const howTo = useLandedAt(shown.landing, openHere);
  useViewedOnEachOpen(open, shown.inSight, () => shown.view("panel"));
  const { done, total } = doneOf(shown.quests);
  if (!open)
    return (
      <button ref={tab} type="button" className="al-quests-tab" aria-expanded={false} aria-label={`Quests, ${done} of ${total} done`} onClick={toggled(unfold)}>
        <DoneRing done={done} total={total} />
        <span className="al-quests-tab-word" aria-hidden="true">
          Quests
        </span>
      </button>
    );
  const foldOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") toggled(fold)();
  };
  return (
    <aside className="al-quests al-quests-panel" aria-label="Quests" onKeyDown={foldOnEscape}>
      <header className="al-quests-head">
        <Greeting quests={shown.quests} />
        <button ref={foldButton} type="button" className="al-quests-fold" aria-expanded aria-label="Fold the quests away" title="Fold away. We'll remember." onClick={toggled(fold)}>
          <IconChevronRight />
        </button>
      </header>
      <QuestList quests={shown.quests} openBoard={shown.openBoard} howTo={howTo} />
      <Footer quests={shown.quests} />
    </aside>
  );
}

function useFocusAcrossTheFold(open: boolean) {
  const tab = useRef<HTMLButtonElement>(null);
  const foldButton = useRef<HTMLButtonElement>(null);
  const pressed = useRef(false);
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    focus(open ? foldButton : tab);
  }, [open]);
  const toggled = (change: () => void) => () => {
    pressed.current = true;
    change();
  };
  return { tab, foldButton, toggled };
}

function focus(button: RefObject<HTMLButtonElement | null>) {
  button.current?.focus();
}

function useLandedAt({ asked, landed }: QuestsLanding, openHere: () => void) {
  const [howTo, setHowTo] = useState<string | null>(null);
  useEffect(() => {
    if (asked === null) return;
    openHere();
    setHowTo(asked.howTo);
    landed();
  }, [asked, landed, openHere]);
  return howTo;
}

const eyebrows: Record<MondayQuests["quests"]["kind"], string> = { journey: "Getting started", drawn: "This week", "two-quests": "This week's quests" };

function Greeting({ quests }: { quests: MondayQuests }) {
  const { done, total } = doneOf(quests);
  const journey = quests.quests.kind === "journey";
  const name = quests.firstName === null ? "" : `, ${quests.firstName}`;
  return (
    <div className="al-quests-greeting">
      <p className="al-eyebrow">
        {eyebrows[quests.quests.kind]} · {done} of {total}
      </p>
      <h2 className="al-quests-title">{journey ? `Welcome in${name}` : `Your quests this week${name}`}</h2>
      <p className="al-quests-note">A few small ways to make someone's day. Every quest leaves an unidentified hoggie on your board.</p>
    </div>
  );
}

function Footer({ quests }: { quests: MondayQuests }) {
  const list = quests.quests;
  if (list.kind === "journey") return <footer className="al-quests-foot">Once these are done, three new quests arrive every Monday.</footer>;
  if (list.kind === "two-quests" && !list.quests.some(({ drawn }) => drawn)) return null;
  return <footer className="al-quests-foot">{`${daysLeftWords(quests.daysLeft)} · new quests Monday at 9:00`}</footer>;
}

function QuestList({ quests: { quests, next }, openBoard, howTo = null }: { quests: MondayQuests; openBoard: () => void; howTo?: string | null }) {
  if (quests.kind === "drawn") return <Checklist rows={quests.quests.map(drawnRowOf)} openBoard={openBoard} />;
  if (quests.kind === "two-quests") return <Checklist rows={quests.quests.map(sideRowOf)} openBoard={openBoard} />;
  return <Journey rows={quests.steps.map((step) => journeyRowOf(step, { howToOpen: step.step === howTo, next: step.step === next }))} openBoard={openBoard} />;
}

function Journey({ rows, openBoard }: { rows: Row[]; openBoard: () => void }) {
  return (
    <ol className="al-quests-journey">
      {rows.map((row, index) => (
        <li key={row.goal} className="al-quests-step" data-done={row.done ? "" : undefined} data-next={row.next ? "" : undefined} aria-label={rowLabelOf(row)}>
          <span className="al-quests-ring" aria-hidden="true">
            {row.done ? <IconCheck /> : index + 1}
          </span>
          <div className="al-quests-words">
            {row.next && <span className="al-quests-next">Next</span>}
            <span className="al-quests-goal">{row.goal}</span>
            {(row.next || row.howToOpen) && row.hint !== null && <span className="al-quests-hint">{row.hint}</span>}
            {row.progress.target > 1 && !row.done && <Progress row={row} />}
            {row.boardLink && <BoardLink openBoard={openBoard} />}
          </div>
          {row.reward !== null && <Reward xp={row.reward.xp} won={row.done} />}
        </li>
      ))}
    </ol>
  );
}

function Checklist({ rows, openBoard }: { rows: Row[]; openBoard: () => void }) {
  return (
    <ul className="al-quests-list">
      {rows.map((row) => (
        <li key={row.goal} className="al-quests-row" data-done={row.done ? "" : undefined} aria-label={rowLabelOf(row)}>
          <span className="al-quests-mark" aria-hidden="true">
            {row.done && <IconCheck />}
          </span>
          <div className="al-quests-words">
            {row.next && <span className="al-quests-next">Next</span>}
            <span className="al-quests-goal">{row.goal}</span>
            {!row.done && row.hint !== null && <span className="al-quests-hint">{row.hint}</span>}
            <Progress row={row} />
            {row.boardLink && <BoardLink openBoard={openBoard} />}
          </div>
          {row.reward !== null && <Reward xp={row.reward.xp} won={row.done} />}
        </li>
      ))}
    </ul>
  );
}

function BoardLink({ openBoard }: { openBoard: () => void }) {
  return (
    <button type="button" className="al-quests-board" onClick={openBoard}>
      Identify it on your board →
    </button>
  );
}

function Progress({ row: { progress, done } }: { row: Row }) {
  const share = Math.min(1, progress.done / progress.target);
  return (
    <span className="al-quests-progress" role="img" aria-label={`${progress.done} of ${progress.target}`}>
      <span className="al-quests-track">
        <span className="al-quests-fill" style={{ width: `${Math.max(4, share * 100)}%` }} data-done={done ? "" : undefined} />
      </span>
      <span className="al-quests-count">
        {progress.done}/{progress.target}
      </span>
    </span>
  );
}

function Reward({ xp, won }: { xp: number; won: boolean }) {
  return (
    <span className="al-quests-reward" data-won={won ? "" : undefined} aria-hidden="true">
      <span className="al-quests-xp">+{xp} XP</span>
      <span className="al-quests-card">
        <CardBack />
      </span>
    </span>
  );
}

function DoneRing({ done, total }: { done: number; total: number }) {
  const radius = 15;
  const length = 2 * Math.PI * radius;
  return (
    <span className="al-quests-done-ring" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={radius} className="al-quests-done-track" />
        <circle cx="18" cy="18" r={radius} className="al-quests-done-fill" strokeDasharray={length} strokeDashoffset={length * (1 - Math.max(0.04, done / total))} />
      </svg>
      <span className="al-quests-done-count">
        {done}/{total}
      </span>
    </span>
  );
}

function journeyRowOf({ goal, hint, progress, done, reward, item }: GettingStartedStep, { howToOpen, next }: { howToOpen: boolean; next: boolean }): Row {
  return { goal, hint, howToOpen, next, progress, done, reward, boardLink: item === "waiting" };
}

function drawnRowOf({ goal, progress, done, reward, item }: DrawnQuest): Row {
  return { goal, hint: null, howToOpen: false, next: false, progress, done, reward, boardLink: item === "waiting" };
}

function sideRowOf({ goal, hint, progress, done, reward, item, next }: SideQuest): Row {
  return { goal, hint, howToOpen: false, next, progress, done, reward, boardLink: item === "waiting" };
}

function rowLabelOf({ goal, done, next, reward }: Row) {
  const state = done ? "done" : next ? "next" : "not yet";
  if (reward === null) return `${goal}: ${state}`;
  return `${goal}: ${state}, ${done ? `won ${reward.xp} XP and a hoggie` : `+${reward.xp} XP and an unidentified hoggie`}`;
}

export function doneOf({ quests }: MondayQuests) {
  const rows = quests.kind === "journey" ? quests.steps : quests.quests;
  return { done: rows.filter(({ done }) => done).length, total: rows.length };
}

function daysLeftWords(days: number) {
  return days === 1 ? "1 day left" : `${days} days left`;
}
