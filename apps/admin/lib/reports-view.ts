import type { ReportForReview, ReportService, ReportState } from "@brandbasket/db";
import { isPhoneAccountEmail } from "@brandbasket/db/phone-account";
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

const HEADLINE_CHARACTERS = 110;

/** The first line of a report as the list shows it. */
export function reportPreview(content: Record<string, unknown>): string {
  const headline = typeof content.headline === "string" ? content.headline : "";
  return headline.length > HEADLINE_CHARACTERS ? `${headline.slice(0, HEADLINE_CHARACTERS).trimEnd()}...` : headline;
}

type ChipVariant = "idle" | "waiting" | "active" | "failed";
const CHIP_VARIANTS: Readonly<Record<PillTone, ChipVariant>> = { wait: "waiting", problem: "failed", done: "active", todo: "idle", progress: "active" };

/** One line of the Reports list. Plain data: it crosses from the server page to the client list. */
export interface ReportRow {
  readonly id: string;
  readonly businessName: string;
  readonly service: string;
  readonly month: string;
  readonly stateLabel: string;
  readonly chip: ChipVariant;
  readonly opening: string;
  /** Approved but never sent: the earlier send did not finish, so the row's verb is Retry send. */
  readonly retry: boolean;
  /** Who a send emails, for the confirm. Null when nobody can be emailed (no address, or a phone sign-up). Read only for a retry row. */
  readonly ownerEmail: string | null;
}

export function toReportRow(row: ReportForReview, ownerEmail: string | null): ReportRow {
  const state = REPORT_STATE_LABELS[row.state];
  return {
    id: row.id,
    businessName: row.businessName,
    service: serviceTitle(row.service),
    month: monthLabel(row.month),
    stateLabel: state.label,
    chip: CHIP_VARIANTS[state.tone],
    opening: reportPreview(row.content),
    retry: row.state === "approved",
    ownerEmail: ownerEmail === null || isPhoneAccountEmail(ownerEmail) ? null : ownerEmail,
  };
}

/** The confirm before a send or a retry. It names the address, and says plainly when nobody will be emailed. */
export function sendReportCopy(row: { readonly month: string; readonly ownerEmail: string | null; readonly retry: boolean }): { readonly title: string; readonly consequence: string; readonly confirmLabel: string } {
  const reach =
    row.ownerEmail === null
      ? "The owner has no email address on record, so nobody is emailed. The customer sees the report in their dashboard."
      : `${row.ownerEmail} is emailed the PDF now, unless the owner turned report emails off.`;
  const to = row.ownerEmail === null ? "" : ` to ${row.ownerEmail}`;
  return row.retry
    ? { title: `Try sending the ${row.month} report${to} again?`, consequence: `The earlier attempt did not finish. ${reach} A sent report cannot be recalled.`, confirmLabel: "Retry send" }
    : { title: `Send the ${row.month} report${to}?`, consequence: `It is made into a PDF. ${reach} A sent report cannot be recalled.`, confirmLabel: "Send report" };
}

const IST_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric" });

/**
 * CD-15: the review window is the 1st to the 5th of the month (India time), or any time while a draft is unsent. Unsent reports
 * are never hidden by the date; the date only decides whether an empty queue is still expected to fill.
 */
export function reportReviewWindowOpen(now: Date, unsentCount: number): boolean {
  return unsentCount > 0 || Number(IST_DAY.format(now)) <= 5;
}
