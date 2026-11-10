import type { FetchedMessage, Mention, MessageContent, MessageDeleted, MessageEvent, MessageRef, Visibility } from "../engine/messageEvent.ts";
import { isText, segmentsOf, type RichElement, type RichTextMessage } from "./richText.ts";

type ChatMessage = RichTextMessage & {
  subtype?: string;
  user?: string;
  bot_id?: string;
  ts: string;
  thread_ts?: string;
  edited?: { ts: string };
};

export type SlackMessage = ChatMessage & {
  type: string;
  channel: string;
  channel_type?: string;
  deleted_ts?: string;
  message?: ChatMessage;
  previous_message?: ChatMessage;
};

export type EventCallback = { type: "event_callback"; team_id: string; event_id: string; event_time: number; event: { type: string } };

const countedSubtypes = new Set([undefined, "thread_broadcast", "file_share"]);
const uncountedContainers = new Set(["rich_text_quote", "rich_text_preformatted"]);
const containerBoundary = "\n";

export function isMessage(event: { type: string }): event is SlackMessage {
  return event.type === "message";
}

export function messageEventOf(envelope: EventCallback): MessageEvent | MessageDeleted | null {
  const event = envelope.event;
  if (!isMessage(event) || !isText(envelope.team_id) || !isText(envelope.event_id) || !isText(event.channel)) return null;
  if (isDeletion(event)) return deletionOf(envelope.team_id, event);
  const visibility = visibilityOf(event.channel_type);
  if (visibility === undefined) return null;
  const source = { workspace: envelope.team_id, channel: event.channel, visibility };
  if (event.subtype === "message_changed") return editOf(source, event);
  if (!countedSubtypes.has(event.subtype)) return null;
  return messageEventFrom({ ...source, kind: "posted", message: event, revisionTs: event.ts });
}

function visibilityOf(channelType: string | undefined): Visibility | undefined {
  if (channelType === "channel") return "public";
  if (channelType === "group") return "private";
  return undefined;
}

function isDeletion(event: SlackMessage) {
  return event.subtype === "message_deleted" || (event.subtype === "message_changed" && event.message?.subtype === "tombstone");
}

function deletionOf(workspace: string, event: SlackMessage): MessageDeleted | null {
  const deletedTs = event.subtype === "message_deleted" ? event.deleted_ts : event.message?.ts;
  if (!isText(deletedTs)) return null;
  return {
    kind: "deleted",
    ref: { workspace, conversation: event.channel, message: deletedTs },
    wasKudosCandidate: event.previous_message !== undefined && isKudosCandidate(countableContent(event.previous_message)),
  };
}

type Channel = { workspace: string; channel: string; visibility: Visibility };

function editOf(channel: Channel, event: SlackMessage): MessageEvent | null {
  const message = event.message;
  const editedTs = message?.edited?.ts;
  if (message === undefined || !isText(editedTs)) return null;
  return messageEventFrom({ ...channel, kind: "edited", message, revisionTs: editedTs });
}

type Source = Channel & { kind: MessageEvent["kind"]; message: ChatMessage; revisionTs: string };

function messageEventFrom({ kind, workspace, channel, visibility, message, revisionTs }: Source): MessageEvent | null {
  if (!isPostedByAPerson(message)) return null;
  const revision = revisionOf(revisionTs);
  return {
    kind,
    ref: { workspace, conversation: channel, message: message.ts },
    ...(isThreadReply(message) && { threadRoot: message.thread_ts }),
    author: message.user,
    revision,
    at: Number(revision / 1000n),
    content: countableContent(message),
    words: { segments: segmentsOf(message), visibility },
  };
}

export type Fetched = { kind: "found"; message: FetchedMessage } | { kind: "deleted" } | { kind: "unreadable" };

export function fetchedMessageOf(ref: MessageRef, messages: unknown): Fetched {
  if (!Array.isArray(messages)) return { kind: "unreadable" };
  const message: unknown = messages.find((listed: unknown) => isChatMessage(listed) && listed.ts === ref.message);
  if (!isChatMessage(message) || message.subtype === "tombstone") return { kind: "deleted" };
  if (!countedSubtypes.has(message.subtype) || !isPostedByAPerson(message)) return { kind: "unreadable" };
  const editedTs = message.edited?.ts;
  const edited = isText(editedTs);
  return {
    kind: "found",
    message: { ref, author: message.user, revision: revisionOf(edited ? editedTs : message.ts), edited, content: countableContent(message), segments: segmentsOf(message) },
  };
}

function isChatMessage(value: unknown): value is ChatMessage {
  return typeof value === "object" && value !== null && isText((value as ChatMessage).ts);
}

export function mayAffectKudos(event: MessageEvent | MessageDeleted | null): event is MessageEvent | MessageDeleted {
  if (event === null) return false;
  return event.kind !== "posted" || isKudosCandidate(event.content);
}

function isKudosCandidate(content: MessageContent) {
  return content.mentions.length > 0 && content.emoji.length > 0;
}

function isPostedByAPerson(message: ChatMessage): message is ChatMessage & { user: string } {
  return isText(message.user) && isText(message.ts) && message.bot_id === undefined;
}

function isThreadReply(message: ChatMessage) {
  return isText(message.thread_ts) && message.thread_ts !== message.ts;
}

function revisionOf(ts: string): bigint {
  const [seconds = "0", fraction = ""] = ts.split(".");
  return BigInt(seconds) * 1_000_000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
}

function countableContent(message: ChatMessage): MessageContent {
  const content = { mentions: [] as Mention[], emoji: [] as string[], mentionsBeforeEmoji: [] as number[], text: "" };
  const visit = (element: RichElement) => {
    if (uncountedContainers.has(element.type) || isStruckOrCode(element.style)) return;
    const mention = mentionOf(element);
    if (mention) content.mentions.push(mention);
    else if (element.type === "emoji" && isText(element.name)) {
      content.emoji.push(element.name);
      content.mentionsBeforeEmoji.push(content.mentions.length);
    }
    else if (element.type === "text" && isText(element.text)) content.text += element.text;
    if (element.elements === undefined) return;
    element.elements.forEach(visit);
    content.text += containerBoundary;
  };
  for (const block of message.blocks ?? []) if (block.type === "rich_text") block.elements?.forEach(visit);
  return content;
}

function mentionOf(element: RichElement): Mention | undefined {
  if (element.type === "user" && isText(element.user_id)) return { kind: "person", user: element.user_id };
  if (element.type === "usergroup" && isText(element.usergroup_id)) return { kind: "group", group: element.usergroup_id };
  if (element.type === "broadcast" && isText(element.range)) return { kind: "broadcast", range: element.range };
  return undefined;
}

function isStruckOrCode(style: RichElement["style"]) {
  return style?.strike === true || style?.code === true;
}
