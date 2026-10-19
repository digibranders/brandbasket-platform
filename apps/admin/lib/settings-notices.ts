import { SETUP_CALL_URL_PROBLEMS, type SetupCallUrlProblem } from "@brandbasket/shared/lib/setup-call-link";

/** What the Settings page says after a save. Fixed messages only: the query parameter picks one, nothing more. */
export type SettingsNotice = "setup-call-saved" | "setup-call-cleared" | SetupCallUrlProblem;

export const SETTINGS_NOTICES: Readonly<Record<SettingsNotice, { readonly text: string; readonly ok: boolean }>> = {
  "setup-call-saved": { text: "Saved. Customers see the new link on their Set up your website page straight away.", ok: true },
  "setup-call-cleared": { text: "Cleared. Customers no longer see the Book a call card.", ok: true },
  "not-a-web-address": { text: SETUP_CALL_URL_PROBLEMS["not-a-web-address"], ok: false },
  "not-secure": { text: SETUP_CALL_URL_PROBLEMS["not-secure"], ok: false },
  "too-long": { text: SETUP_CALL_URL_PROBLEMS["too-long"], ok: false },
  "has-a-login": { text: SETUP_CALL_URL_PROBLEMS["has-a-login"], ok: false },
};

export function settingsNoticeHref(notice: SettingsNotice): string {
  return `/settings?saved=${notice}`;
}

export function readSettingsNotice(value: string | string[] | undefined): SettingsNotice | null {
  return typeof value === "string" && Object.hasOwn(SETTINGS_NOTICES, value) ? (value as SettingsNotice) : null;
}
