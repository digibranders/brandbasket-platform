import { SETUP_CALL_URL_PROBLEMS, type SetupCallUrlProblem } from "@brandbasket/shared/lib/setup-call-link";
import { TEAMS_URL_PROBLEMS, type TeamsUrlProblem } from "@brandbasket/shared/lib/teams-webhook";

/** What the Settings page says after a save. Fixed messages only: the query parameter picks one, nothing more. */
export type SettingsNotice =
  | "setup-call-saved"
  | "setup-call-cleared"
  | SetupCallUrlProblem
  | "teams-saved"
  | "teams-removed"
  | "teams-test-sent"
  | "teams-test-failed"
  | "teams-test-unset"
  | "teams-test-unreadable"
  | "teams-nothing-pasted"
  | TeamsUrlProblem;

export const SETTINGS_NOTICES: Readonly<Record<SettingsNotice, { readonly text: string; readonly ok: boolean }>> = {
  "setup-call-saved": { text: "Saved. Customers see the new link on their Set up your website page straight away.", ok: true },
  "setup-call-cleared": { text: "Cleared. Customers no longer see the Book a call card.", ok: true },
  "not-a-web-address": { text: SETUP_CALL_URL_PROBLEMS["not-a-web-address"], ok: false },
  "not-secure": { text: SETUP_CALL_URL_PROBLEMS["not-secure"], ok: false },
  "too-long": { text: SETUP_CALL_URL_PROBLEMS["too-long"], ok: false },
  "has-a-login": { text: SETUP_CALL_URL_PROBLEMS["has-a-login"], ok: false },
  "teams-saved": { text: "Saved. Alerts of that kind now go to that Teams channel. Press Send test to see one arrive.", ok: true },
  "teams-removed": { text: "Removed. Alerts of that kind no longer go to Teams.", ok: true },
  "teams-test-sent": { text: "Test sent. Check the Teams channel.", ok: true },
  "teams-test-failed": { text: "Teams did not accept the test. Check that the flow is turned on and that the address is the latest one from Teams.", ok: false },
  "teams-test-unset": { text: "There is no address saved for that channel yet, so there is nothing to test.", ok: false },
  "teams-test-unreadable": { text: "The saved address can no longer be read. Paste it again and save.", ok: false },
  "teams-nothing-pasted": { text: "Paste the webhook address first. To stop alerts, press Remove.", ok: false },
  "teams-not-a-web-address": { text: TEAMS_URL_PROBLEMS["teams-not-a-web-address"], ok: false },
  "teams-not-secure": { text: TEAMS_URL_PROBLEMS["teams-not-secure"], ok: false },
  "teams-too-long": { text: TEAMS_URL_PROBLEMS["teams-too-long"], ok: false },
  "teams-has-a-login": { text: TEAMS_URL_PROBLEMS["teams-has-a-login"], ok: false },
  "teams-not-a-teams-address": { text: TEAMS_URL_PROBLEMS["teams-not-a-teams-address"], ok: false },
};

export function settingsNoticeHref(notice: SettingsNotice): string {
  return `/settings?saved=${notice}${notice.startsWith("teams-") ? "#teams" : ""}`;
}

export function readSettingsNotice(value: string | string[] | undefined): SettingsNotice | null {
  return typeof value === "string" && Object.hasOwn(SETTINGS_NOTICES, value) ? (value as SettingsNotice) : null;
}
