import type { CommandAction, Confirmation, HomeAction, LinkAction } from "../feedback/home.ts";
import { encodeHomeAction } from "./interactivity.ts";

const accessibilityLabelLimit = 75;
const confirmationTitleLimit = 100;

export function buttonOf(action: HomeAction) {
  return "url" in action ? linkButtonOf(action) : commandButtonOf(action);
}

function commandButtonOf({ label, command, accessibilityLabel, confirm }: CommandAction) {
  const action = encodeHomeAction(command);
  return {
    type: "button",
    text: plainText(label),
    action_id: action,
    value: action,
    ...(accessibilityLabel !== undefined && { accessibility_label: shortened(accessibilityLabel, accessibilityLabelLimit) }),
    ...(confirm !== undefined && { confirm: confirmationOf(confirm) }),
  };
}

function linkButtonOf({ label, url, accessibilityLabel, id }: LinkAction) {
  return urlButtonOf({ label, url, actionId: `website-link:${id}`, accessibilityLabel });
}

export function urlButtonOf({ label, url, actionId, accessibilityLabel }: { label: string; url: string; actionId: string; accessibilityLabel?: string }) {
  return { type: "button", text: plainText(label), url, action_id: actionId, ...(accessibilityLabel !== undefined && { accessibility_label: accessibilityLabel }) };
}

function confirmationOf({ title, text, confirm, deny }: Confirmation) {
  return { title: plainText(shortened(title, confirmationTitleLimit)), text: plainText(text), confirm: plainText(confirm), deny: plainText(deny) };
}

export function shortened(text: string, limit: number) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function escaped(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function slackDayOf(at: number) {
  const seconds = Math.floor(at / 1000);
  return `<!date^${seconds}^{date_short}|${new Date(seconds * 1000).toISOString().slice(0, 10)}>`;
}

export function mrkdwn(text: string) {
  return { type: "mrkdwn", text };
}

export function plainText(text: string) {
  return { type: "plain_text", text };
}
