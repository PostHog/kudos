import type { Action, Block, Element, View } from "./slack.ts";

// App Home as a member sees it: its tab bar, its header, and the buttons and pickers they can use.

// The tab bar is the first row of buttons, wherever the view puts it.
export function tabsOf(view: View) {
  return buttonsOf(view.blocks.find((block) => block.type === "actions")).map((button) => button.text?.text);
}

export function headerOf(view: View) {
  return view.blocks.find((block) => block.type === "header")?.text?.text;
}

export function textOf(view: View) {
  return view.blocks.flatMap((block) => [block.text?.text ?? "", ...(block.elements ?? []).map((element) => element.text?.text ?? "")]).join("\n");
}

// The button labelled `label`, clicked as Slack sends it; with `under`, the first one below the line that reads it. A
// message's blocks read the same way as a view's.
export function button(view: Pick<View, "blocks">, label: string, under?: string): Action {
  const from = under === undefined ? 0 : view.blocks.findIndex((block) => block.text?.text.includes(under) === true);
  if (from === -1) throw new Error(`it shows no line that reads ${under}`);
  const found = view.blocks.slice(from).flatMap(elementsOf).find((element) => element.type === "button" && element.text?.text === label);
  if (found?.action_id === undefined) throw new Error(`it shows no button labelled ${label}`);
  return { type: "button", action_id: found.action_id, ...(found.value !== undefined && { value: found.value }) };
}

// The option labelled `label` of the picker in the block that reads `about`, picked as Slack sends it.
export function option(view: View, about: string, label: string): Action {
  const block = view.blocks.find((candidate) => candidate.text?.text.includes(about));
  const picker = block === undefined ? undefined : elementsOf(block).find((element) => element.type === "static_select");
  const picked = picker?.options?.find((candidate) => candidate.text.text === label);
  if (picker?.action_id === undefined || picked === undefined) throw new Error(`App Home shows no option ${label} for ${about}`);
  return { type: "static_select", action_id: picker.action_id, selected_option: { value: picked.value } };
}

// The labels a picker in the block that reads `about` offers, and the one it shows as picked.
export function pickerOf(view: View, about: string) {
  const block = view.blocks.find((candidate) => candidate.text?.text.includes(about));
  const picker = block === undefined ? undefined : elementsOf(block).find((element) => element.type === "static_select");
  if (picker === undefined) return undefined;
  return { options: (picker.options ?? []).map((candidate) => candidate.text.text), picked: picker.initial_option?.text.text };
}

// The label the picker in the block that reads `about` shows as chosen.
export function chosen(view: View, about: string) {
  return pickerOf(view, about)?.picked;
}

// The channel `channel` picked in the channel picker of the block that reads `about`, as Slack sends it.
export function channelPick(view: View, about: string, channel: string): Action {
  const block = view.blocks.find((candidate) => candidate.text?.text.includes(about));
  const picker = block === undefined ? undefined : elementsOf(block).find((element) => element.type === "channels_select");
  if (picker?.action_id === undefined) throw new Error(`App Home shows no channel picker for ${about}`);
  return { type: "channels_select", action_id: picker.action_id, selected_channel: channel };
}

function buttonsOf(block: Block | undefined) {
  return block === undefined ? [] : elementsOf(block).filter((element) => element.type === "button");
}

function elementsOf(block: Block): Element[] {
  return [...(block.elements ?? []), ...(block.accessory === undefined ? [] : [block.accessory])];
}

// The labels of every button a view or message shows, in order.
export function labelsOf(shown: Pick<View, "blocks">) {
  return shown.blocks.flatMap(elementsOf).flatMap((element) => (element.type === "button" && element.text !== undefined ? [element.text.text] : []));
}

type RichText = { type: string; text?: string; name?: string; elements?: RichText[] };

// A message's bulleted list, such as a quest checklist, one item per entry, with each emoji as Slack spells it.
export function checklistOf(shown: { blocks?: Block[] }) {
  const lists = (shown.blocks ?? []).flatMap((block) => (block.type === "rich_text" ? ((block as RichText).elements ?? []) : [])).filter((element) => element.type === "rich_text_list");
  return lists.flatMap((list) => (list.elements ?? []).map((item) => (item.elements ?? []).map(wordsOf).join("")));
}

function wordsOf(element: RichText) {
  return element.type === "emoji" ? `:${element.name}:` : (element.text ?? "");
}

