// Builds and reads Slack interactions: block actions and suggestions, and the App Home a test sees. Today's tests and the
// rewrite's share it, as they share the fake Slack it reads.
import { expect } from "vitest";
import type { Feature } from "../src/unlocks/feature.ts";
import type { FakeSlack } from "./fakeSlack.ts";

export type TextObject = { type: string; text: string };
type Option = { text: TextObject; value: string };
type Element = {
  type: string;
  text?: TextObject;
  style?: string;
  initial_channel?: string;
  action_id?: string;
  value?: string;
  url?: string;
  placeholder?: TextObject;
  options?: Option[];
  option_groups?: Array<{ label: TextObject; options: Option[] }>;
  initial_option?: Option;
  initial_options?: Option[];
};
export type Block = { type: string; block_id?: string; text?: TextObject; fields?: TextObject[]; elements?: Array<TextObject | Element>; accessory?: Element };
type HomeView = { type: string; blocks: Block[] };

export type BlockAction =
  | { type: "button"; action_id: string; value?: string; block_id?: string }
  | { type: "channels_select"; action_id: string; selected_channel: string | null; block_id?: string }
  | { type: "static_select"; action_id: string; selected_option: Option | { value: string } | null; block_id?: string }
  | { type: "multi_static_select"; action_id: string; selected_options: Option[]; block_id?: string }
  | { type: "multi_external_select"; action_id: string; selected_options: Array<Option | { value: string }>; block_id?: string };

export type MessageState = Record<string, Record<string, { type: "static_select"; selected_option: { value: string } | null }>>;

export function publishedHomeBlocks(slack: FakeSlack, user: string): Block[] {
  const view = slack.homeShownTo(user) as HomeView | undefined;
  expect(view?.type).toBe("home");
  return view?.blocks ?? [];
}

export function publishedHome(slack: FakeSlack, user: string) {
  return readBlocks(publishedHomeBlocks(slack, user));
}

export function readBlocks(blocks: Block[]) {
  return blocks.map(readBlock);
}

export function publishedViews(slack: FakeSlack, user: string) {
  return slack
    .callsTo("views.publish")
    .filter((args) => args.user_id === user)
    .map((args) => args.view as HomeView);
}

export function buttonIn(blocks: Block[], label: string): BlockAction {
  for (const block of blocks) {
    const button = elementsOf(block).find((element) => element.type === "button" && element.text?.text === label);
    if (button) return { type: "button", action_id: button.action_id!, ...(button.value !== undefined && { value: button.value }), ...(block.block_id && { block_id: block.block_id }) };
  }
  throw new Error(`no ${label} button among the blocks`);
}

export function staleButtonOf(command: unknown): BlockAction {
  const encoded = JSON.stringify(command);
  return { type: "button", action_id: encoded, value: encoded };
}

export function buttonInHome(slack: FakeSlack, user: string, label: string): BlockAction {
  return buttonIn(publishedHomeBlocks(slack, user), label);
}

export function openUnlockInHome(slack: FakeSlack, user: string, feature: Feature): BlockAction {
  const command = JSON.stringify({ type: "openUnlock", feature });
  return buttonIn(publishedHomeBlocks(slack, user).filter(({ accessory }) => accessory?.value === command), "Open");
}

export function channelPickerInHome(slack: FakeSlack, user: string, channel: string | null): BlockAction {
  const picker = publishedHomeBlocks(slack, user)
    .flatMap(elementsOf)
    .find((element) => element.type === "channels_select");
  expect(picker, `a channel picker in ${user}'s App Home`).toBeDefined();
  return { type: "channels_select", action_id: picker!.action_id!, selected_channel: channel };
}

export function menuOptionInHome(slack: FakeSlack, user: string, line: string, option: string): BlockAction {
  const menu = publishedHomeBlocks(slack, user).find((block) => block.text?.text === line && block.accessory?.type === "static_select")?.accessory;
  expect(menu, `a menu beside ${line} in ${user}'s App Home`).toBeDefined();
  return selectedOptionOf(menu!, option);
}

export function menuOptionsInHome(slack: FakeSlack, user: string, line: string) {
  const menu = publishedHomeBlocks(slack, user).find((block) => block.text?.text === line)?.accessory;
  return menu?.options?.map((option) => plainText(option.text));
}

export function staleMenuOptionOf(command: unknown): BlockAction {
  return { type: "static_select", action_id: "stale-menu", selected_option: { text: { type: "plain_text", text: "stale" }, value: JSON.stringify(command) } };
}

function selectedOptionOf(menu: Element, label: string): BlockAction {
  const option = menu.options?.find(({ text }) => text.text === label);
  expect(option, `a ${label} option`).toBeDefined();
  return { type: "static_select", action_id: menu.action_id!, selected_option: option! };
}

export function groupPickerInHome(slack: FakeSlack, user: string, ...picked: string[]): BlockAction {
  const picker = publishedHomeBlocks(slack, user)
    .flatMap(elementsOf)
    .find((element) => element.type === "multi_static_select");
  expect(picker, `a group picker in ${user}'s App Home`).toBeDefined();
  const options = optionsOf(picker!);
  const selected = picked.map((name) => options.find(({ text }) => text.text === name));
  expect(selected, `${picked.join(", ")} among the picker's options`).not.toContain(undefined);
  return { type: "multi_static_select", action_id: picker!.action_id!, selected_options: selected as Option[] };
}

export function externalPickerInHome(slack: FakeSlack, user: string) {
  const picker = publishedHomeBlocks(slack, user)
    .flatMap(elementsOf)
    .find((element) => element.type === "multi_external_select");
  expect(picker, `an external picker in ${user}'s App Home`).toBeDefined();
  return picker!;
}

export function externalPicksInHome(slack: FakeSlack, user: string, ...picked: string[]): BlockAction {
  const picker = externalPickerInHome(slack, user);
  return { type: "multi_external_select", action_id: picker.action_id!, selected_options: picked.map((value) => ({ value })) };
}

export function stalePicksOf(actionId: string, ...picked: string[]): BlockAction {
  return { type: "multi_external_select", action_id: actionId, selected_options: picked.map((value) => ({ value })) };
}

export function blockSuggestion(user: string, actionId: string, typed: string, { team = "T1" } = {}) {
  const payload = {
    type: "block_suggestion",
    team: { id: team, domain: "kudos" },
    user: { id: user, team_id: team },
    api_app_id: "A_KUDOS",
    action_id: actionId,
    block_id: "b1",
    value: typed,
    ...homeContainer(),
  };
  return new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
}

export function optionsOf(element: Element): Option[] {
  return element.options ?? (element.option_groups ?? []).flatMap(({ options }) => options);
}

export function optionPickedInHome(slack: FakeSlack, user: string, row: string, option: string): BlockAction {
  const picker = publishedHomeBlocks(slack, user).find((block) => block.text?.text.startsWith(`*${row}*`))?.accessory;
  const picked = picker?.options?.find(({ text }) => text.text === option);
  expect(picked, `${option} in the ${row} picker in ${user}'s App Home`).toBeDefined();
  return { type: "static_select", action_id: picker!.action_id!, selected_option: { value: picked!.value } };
}

let interactions = 0;

export type ClickedMessage = { channel: string; ts: string; ephemeral?: boolean; threadTs?: string };

export function blockActions(user: string, action: BlockAction, options: { team?: string; inMessage?: ClickedMessage; state?: MessageState } = {}) {
  const team = options.team ?? "T1";
  interactions += 1;
  const payload = {
    type: "block_actions",
    team: { id: team, domain: "kudos" },
    user: { id: user, team_id: team },
    api_app_id: "A_KUDOS",
    trigger_id: `${interactions}.1760349600.trigger`,
    ...(options.inMessage === undefined ? homeContainer() : messageContainer(options.inMessage)),
    actions: [{ block_id: "b1", ...action, action_ts: "1760349600.000300" }],
    ...(options.state !== undefined && { state: { values: options.state } }),
  };
  return new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
}

function homeContainer() {
  return { container: { type: "view", view_id: "V_HOME" }, view: { id: "V_HOME", type: "home" } };
}

function messageContainer({ channel, ts, ephemeral = false, threadTs }: ClickedMessage) {
  const container = { type: "message", message_ts: ts, channel_id: channel, is_ephemeral: ephemeral, ...(threadTs && { thread_ts: threadTs }) };
  return { container, channel: { id: channel }, ...(!ephemeral && { message: { type: "message", ts } }) };
}

function elementsOf(block: Block): Element[] {
  const elements = block.type === "actions" ? (block.elements as Element[]) : [];
  return [...elements, ...(block.accessory ? [block.accessory] : [])];
}

function readBlock(block: Block) {
  if (block.type === "divider") return "divider";
  if (block.type === "header") return `header: ${plainText(block.text)}`;
  if (block.type === "actions") return `actions: ${(block.elements as Element[]).map(readButton).join(" | ")}`;
  if (block.type === "context") return `context: ${(block.elements as TextObject[]).map(mrkdwn).join(" ")}`;
  if (block.fields) return `${block.type} fields: ${block.fields.map(mrkdwn).join(" | ")}`;
  const accessory = block.accessory ? ` ${readAccessory(block.accessory)}` : "";
  return `${block.type}: ${mrkdwn(block.text)}${accessory}`;
}

function readButton(button: Element) {
  if (button.type === "static_select") return readSelect(button);
  if (button.type === "multi_static_select") return `[multi_static_select: ${(button.initial_options ?? []).map(({ text }) => plainText(text)).join(", ") || "none"}]`;
  const label = plainText(button.text);
  return button.style === "primary" ? `[${label}]` : label;
}

function readAccessory(element: Element) {
  if (element.type === "button" && element.url !== undefined) return `[link: ${plainText(element.text)} ${element.url}]`;
  if (element.type === "button") return `[button: ${plainText(element.text)}]`;
  if (element.type === "static_select" && element.initial_option === undefined) return `[static_select: ${plainText(element.placeholder)}]`;
  if (element.type === "static_select") return `[select: ${plainText(element.initial_option?.text)}]`;
  if (element.type === "multi_static_select") return readButton(element);
  if (element.type === "multi_external_select") return `[multi_external_select: ${(element.initial_options ?? []).map(({ text }) => plainText(text)).join(", ") || "none"}]`;
  return `[${element.type}: ${element.initial_channel ?? "none"}]`;
}

function readSelect(select: Element) {
  const options = [...(select.options ?? []), ...(select.option_groups ?? []).flatMap((group) => group.options)];
  const picked = select.initial_option === undefined ? "none" : plainText(select.initial_option.text);
  return `[select: ${picked} of ${options.map((option) => plainText(option.text)).join(", ")}]`;
}

export function selectIn(blocks: Block[]): Element & { action_id: string; block_id?: string } {
  for (const block of blocks) {
    const select = elementsOf(block).find((element) => element.type === "static_select");
    if (select) return { ...select, action_id: select.action_id!, ...(block.block_id && { block_id: block.block_id }) };
  }
  throw new Error("no select among the blocks");
}

export function optionNamed(select: Element, label: string): string {
  const options = [...(select.options ?? []), ...(select.option_groups ?? []).flatMap((group) => group.options)];
  const option = options.find((candidate) => candidate.text.text === label);
  if (option === undefined) throw new Error(`no ${label} option in the select`);
  return option.value;
}

function plainText(text: TextObject | undefined) {
  expect(text?.type).toBe("plain_text");
  return text?.text;
}

function mrkdwn(text: TextObject | undefined) {
  expect(text?.type).toBe("mrkdwn");
  return text?.text;
}
