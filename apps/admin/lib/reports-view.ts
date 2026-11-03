import type { ReportService, ReportState } from "@brandbasket/db";
import { monthRange, parseMonthKey } from "@brandbasket/shared/lib/reports/period";
import { REPORT_SERVICE_TITLES } from "@brandbasket/shared/lib/reports/services";
import type { PillTone } from "@/components/console/status-pill";

/** What staff read for a report's state, and the colour that helps them see it. */
export const REPORT_STATE_LABELS: Readonly<Record<ReportState, { readonly label: string; readonly tone: PillTone }>> = {
  draft: { label: "Draft", tone: "wait" },
  held: { label: "On hold", tone: "todo" },
  approved: { label: "Approved, not sent", tone: "problem" },
  sent: { label: "Sent", tone: "done" },
};

export function serviceTitle(service: ReportService): string {
  return REPORT_SERVICE_TITLES[service];
}

/** "2026-10-01" as "October 2026"; the text itself for anything that is not the first of a month. */
export function monthLabel(month: string): string {
  const key = month.endsWith("-01") ? parseMonthKey(month.slice(0, 7)) : null;
  if (key === null) return month;
  const range = monthRange(key);
  return `${range.name} ${range.year}`;
}

export type ReportNotice = { readonly tone: "ok" | "problem"; readonly text: string };

const EMAIL_WORDS: Readonly<Record<string, string>> = {
  sent: "The owner has been emailed.",
  "owner-turned-off": "The owner has turned off report emails, so none was sent.",
  "already-sent": "The owner had already been emailed about this report.",
  "no-address": "The owner has no email address, so none was sent.",
  failed: "The report is sent, but the email to the owner did not go. Resend it from Emails and webhooks.",
};

const NOTICES: Readonly<Record<string, ReportNotice>> = {
  held: { tone: "ok", text: "The report is on hold. It stays out of the customer's view until you release it." },
  released: { tone: "ok", text: "The report is back to a draft." },
  "not-allowed": { tone: "problem", text: "The report cannot move that way from where it is now." },
  changed: { tone: "problem", text: "Someone else changed this report a moment ago. Open it again and check." },
  "not-found": { tone: "problem", text: "That report does not exist." },
  "send-failed": { tone: "problem", text: "The report could not be sent, and the customer has not seen it. Nothing was emailed. Try again; if it keeps failing, tell the team." },
};

/** The line under the header after an action, from the `done` address parameter (`sent.<email result>`, `held`, ...). */
export function reportNotice(done: string | undefined): ReportNotice | null {
  if (done === undefined) return null;
  if (done.startsWith("sent.")) {
    const email = EMAIL_WORDS[done.slice("sent.".length)];
    return email === undefined ? null : { tone: done === "sent.failed" ? "problem" : "ok", text: `The report is sent. ${email}` };
  }
  return NOTICES[done] ?? null;
}
