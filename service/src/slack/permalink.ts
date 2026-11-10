import type { MessageRef } from "../engine/messageEvent.ts";

export function permalinkOf(workspaceUrl: string, { conversation, message }: MessageRef, threadRoot: string | null): string {
  const link = `${withTrailingSlash(workspaceUrl)}archives/${conversation}/p${message.replace(".", "")}`;
  return threadRoot === null || threadRoot === message ? link : `${link}?thread_ts=${threadRoot}&cid=${conversation}`;
}

export function channelLinkOf(workspaceUrl: string, channel: string): string {
  return `${withTrailingSlash(workspaceUrl)}archives/${channel}`;
}

export function profileLinkOf(workspaceUrl: string, user: string): string {
  return `${withTrailingSlash(workspaceUrl)}team/${encodeURIComponent(user)}`;
}

function withTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

const channelId = /^[CG][A-Z0-9]{2,}$/;

export function channelOfLink(link: string): string | null {
  const pasted = link.trim();
  if (channelId.test(pasted)) return pasted;
  const url = slackUrlOf(pasted);
  if (url === null) return null;
  const [place, ...rest] = url.pathname.split("/").filter((part) => part !== "");
  const channel = place === "archives" ? rest[0] : place === "client" ? rest[1] : undefined;
  return channel !== undefined && channelId.test(channel) ? channel : null;
}

function slackUrlOf(pasted: string): URL | null {
  if (!URL.canParse(pasted)) return null;
  const url = new URL(pasted);
  return url.protocol === "https:" && (url.hostname === "slack.com" || url.hostname.endsWith(".slack.com")) ? url : null;
}
