import type { ChecklistItem } from "../mondayDm/questsCopy.ts";

const marks: Record<ChecklistItem["mark"], { type: "emoji"; name: string; skin_tone?: number }> = {
  done: { type: "emoji", name: "white_check_mark" },
  next: { type: "emoji", name: "point_right", skin_tone: 2 },
  open: { type: "emoji", name: "white_circle" },
};

export function checklistBlockOf(checklist: ChecklistItem[]) {
  return { type: "rich_text", elements: [{ type: "rich_text_list", style: "bullet", indent: 0, elements: checklist.map(checklistItemOf) }] };
}

function checklistItemOf({ goal, mark, progress, howTo, reward }: ChecklistItem) {
  const goalText = { type: "text", text: ` ${goal}`, style: { bold: mark === "next", strike: mark === "done" } };
  const progressText = progress === null ? [] : [{ type: "text", text: `  ${progress}`, style: { italic: true } }];
  return { type: "rich_text_section", elements: [marks[mark], goalText, ...progressText, ...secondLineOf([howTo, reward])] };
}

function secondLineOf(parts: Array<string | undefined>) {
  const line = parts.filter((part) => part !== undefined).join("  ");
  return line === "" ? [] : [{ type: "text", text: "\n" }, ...withEmojiOf(line)];
}

type PlainText = { type: "text"; text: string } | { type: "emoji"; name: string };

function withEmojiOf(text: string): PlainText[] {
  return text.split(/:([^:\s]+):/).flatMap((part, index): PlainText[] => (index % 2 === 1 ? [{ type: "emoji", name: part }] : part === "" ? [] : [{ type: "text", text: part }]));
}
