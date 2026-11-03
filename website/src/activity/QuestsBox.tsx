import { IconCheck } from "@posthog/icons";
import type { ReactNode } from "react";
import type { LoopLesson } from "../../../convex/website/activity";
import type { MondayQuests } from "../../../convex/website/quests";
import { doneOf } from "../album/QuestsPanel";
import { NamedEmoji } from "../Emoji";

type Check = { goal: string; how: ReactNode; done: boolean; reward: { xp: number } | null };

export function QuestsBox({ quests, kudos }: { quests: MondayQuests; kudos: LoopLesson }) {
  const { done, total } = doneOf(quests);
  return (
    <section className="al-week-box" aria-label="This week's quests">
      <h2 className="al-week-box-title">
        This week's quests · {done} of {total}
      </h2>
      <ul className="al-checks">
        {checksOf(quests, <HowToGiveAKudos kudos={kudos} />).map((check) => (
          <QuestCheck key={check.goal} check={check} />
        ))}
      </ul>
    </section>
  );
}

function QuestCheck({ check: { goal, how, done, reward } }: { check: Check }) {
  return (
    <li className="al-check" data-done={done ? "" : undefined}>
      <span className="al-check-box" role="img" aria-label={done ? "Done" : "Not done"}>
        {done && <IconCheck />}
      </span>
      <span className="al-check-words">
        <span className="al-check-goal">{goal}</span>
        {how !== null && <span className="al-check-note">{how}</span>}
        {reward !== null && <span className="al-check-note">{`+${reward.xp} XP and a hoggie`}</span>}
      </span>
    </li>
  );
}

function HowToGiveAKudos({ kudos }: { kudos: LoopLesson }) {
  return (
    <>
      Write <NamedEmoji name={kudos.kudosEmoji} image={kudos.kudosEmojiImage ?? undefined} /> @name and what they did, in any channel HedgeHug is in.
    </>
  );
}

function checksOf({ quests }: MondayQuests, howToGiveAKudos: ReactNode): Check[] {
  if (quests.kind === "drawn") return quests.quests.map(({ goal, done, reward }) => ({ goal, how: howToGiveAKudos, done, reward }));
  if (quests.kind === "two-quests") return quests.quests.map(({ side, goal, hint, done, reward }) => ({ goal, how: hint ?? (side === "kudos" ? howToGiveAKudos : null), done, reward }));
  return quests.steps.map(({ goal, hint, done, reward }) => ({ goal, how: hint, done, reward }));
}
