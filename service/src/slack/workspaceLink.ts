export function workspaceLink(workspace: string) {
  return `https://app.slack.com/client/${encodeURIComponent(workspace)}`;
}
