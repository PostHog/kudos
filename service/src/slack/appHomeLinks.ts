import { ReportableError } from "../analytics/exceptions.ts";
import type { SettingsFooter } from "../feedback/settingsFooter.ts";

export function appHomeLink(workspace: string, label: string) {
  return `<${appHomeUrl(workspace)}|${label}>`;
}

export function appHomeUrl(workspace: string) {
  return `slack://app?${new URLSearchParams({ team: workspace, id: appId(), tab: "home" })}`;
}

export function settingsFooterText(workspace: string, { appHome, rest }: SettingsFooter) {
  return `${appHomeLink(workspace, appHome)}${rest}`;
}

function appId() {
  const id = process.env.SLACK_APP_ID;
  if (!id) throw new ReportableError("SLACK_APP_ID is not set");
  return id;
}
