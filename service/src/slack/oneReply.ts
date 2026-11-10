import type { OneReply, OneReplyButton, OneReplyItem } from "../feedback/oneReply.ts";
import type { Line } from "../feedback/segments.ts";
import type { SettingsFooter } from "../feedback/settingsFooter.ts";
import { settingsFooterText } from "./appHomeLinks.ts";
import { escaped, mrkdwn, shortened, urlButtonOf } from "./blocks.ts";
import type { ChecklistItem } from "../mondayDm/questsCopy.ts";
import { checklistBlockOf } from "./checklist.ts";
import { slackTextOf } from "./delivery.ts";

const longestText = 3_000;

export function oneReplyContentOf(workspace: string, { headline, gains, context, quests, items, moreItems, buttons }: OneReply, footer: SettingsFooter | null) {
  const said = slackTextOf([headline]);
  const gained = gains === null ? "" : ` · ${slackTextOf([gains])}`;
  return {
    text: [`${said}${gained}`, slackTextOf(context), ...quests.map(questTextOf), ...itemLinesOf(items, moreItems)].filter((line) => line !== "").join("\n"),
    blocks: [
      { type: "section", text: mrkdwn(`*${said}*${gained}`) },
      contextOf(context),
      ...(quests.length > 0 ? [checklistBlockOf(quests)] : []),
      ...(items.length > 0 ? [{ type: "section", text: mrkdwn(shortened(itemLinesOf(items, moreItems).join("\n"), longestText)) }] : []),
      ...(buttons.length > 0 ? [{ type: "actions", elements: buttons.map(buttonOf) }] : []),
      ...(footer === null ? [] : [contextOf([[{ text: settingsFooterText(workspace, footer) }]])]),
    ],
  };
}

function contextOf(lines: Line[]) {
  return { type: "context", elements: [mrkdwn(shortened(slackTextOf(lines), longestText))] };
}

function questTextOf({ goal, mark, progress }: ChecklistItem) {
  return `${mark === "done" ? "Done: " : ""}${goal}${progress === null ? "" : ` · ${progress}`}`;
}

function itemLinesOf(items: OneReplyItem[], moreItems: number) {
  const lines = items.map(({ first, comesNextWeek }) => (comesNextWeek ? `🎁 Your next item for ${escaped(first)} comes next week` : `🎁 *An item for thanking ${escaped(first)}*`));
  return moreItems > 0 ? [...lines, `And ${moreItems} more.`] : lines;
}

function buttonOf({ label, url, destination, primary }: OneReplyButton) {
  return { ...urlButtonOf({ label, url, actionId: `dm-link:kudos-reply:${destination}` }), ...(primary && { style: "primary" }) };
}
