import type { Command } from "../commands/commands.ts";
import type { HomeLine } from "../feedback/home.ts";
import { customKudosEmojiPerWorkspace } from "../store/customKudosEmoji.ts";
import { plainText, shortened } from "./blocks.ts";

const optionTextLimit = 75;

export const customEmojiPickerAction = "setCustomKudosEmoji" satisfies Command["type"];

export function customEmojiPickerOf({ placeholder, picked }: Extract<HomeLine, { kind: "pick-custom-emoji" }>) {
  const initial = picked.map(customEmojiOptionOf);
  return {
    type: "multi_external_select",
    action_id: customEmojiPickerAction,
    placeholder: plainText(placeholder),
    min_query_length: 1,
    max_selected_items: customKudosEmojiPerWorkspace,
    ...(initial.length > 0 && { initial_options: initial }),
  };
}

export function customEmojiOptionOf(name: string) {
  return { text: plainText(shortened(`:${name}:`, optionTextLimit)), value: name };
}
