import type { ReportDocument, ReportService } from "@brandbasket/db";
import { monthRange, parseMonthKey, type MonthKey } from "@brandbasket/shared/lib/reports/period";
import { z } from "zod";

/*
 * Which months and reports a customer sees, and how a stored report document is read. A customer sees SENT reports only
 * (row-level security does it in the database; the grouping below also refuses any other state, so a draft can never be
 * shown as a month). A month appears because a sent report exists for it, never because the calendar has reached it.
 */

export const REPORTS_PATH = "/reports";

/** The order the services are shown in: the catalogue order. */
export const SERVICE_ORDER = ["website", "social", "search"] as const satisfies readonly ReportService[];

export function isReportService(text: string | null): text is ReportService {
  return SERVICE_ORDER.some((service) => service === text);
}

/** The month in a URL, "2026-10", or null when it is not a real month. */
export const parseMonthParam = (text: string): MonthKey | null => parseMonthKey(text);

/** The key of a stored month ("2026-10-01"); null for anything that is not the first of a month. */
export function monthKeyOfDocument(month: string): MonthKey | null {
  return /^\d{4}-\d{2}-01$/.test(month) ? parseMonthKey(month.slice(0, 7)) : null;
}

/** "October 2026". */
export function monthTitle(key: MonthKey): string {
  const { name, year } = monthRange(key);
  return `${name} ${year}`;
}

export function reportPath(key: MonthKey): string {
  return `${REPORTS_PATH}/${key}`;
}

export function pdfPath(key: MonthKey, service: ReportService): string {
  return `${REPORTS_PATH}/${key}/pdf?service=${service}`;
}

/**
 * What a report document holds, as the screen reads it. The composer (packages/shared/src/lib/reports/content.ts) writes
 * this shape and keeps the same limits. A document that does not fit is not guessed at: it is shown as unreadable and reported.
 */
export const REPORT_CONTENT_VERSION = 1;

export const reportContentSchema = z.object({
  /** One plain sentence about the month for this service. */
  headline: z.string().trim().min(1).max(400),
  /** The figures for the service's card, already worded and formatted when the report was frozen. */
  figures: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(40) })).min(1).max(8),
  /** What we did this month, one line each. */
  whatWeDid: z.array(z.string().trim().min(1).max(300)).max(20),
  /** Ranked lists (top searches, most viewed pages, where enquiries came from), already worded. Optional: older documents have none. */
  lists: z
    .array(z.object({ title: z.string().trim().min(1).max(60), rows: z.array(z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(40) })).min(1).max(10) }))
    .max(4)
    .optional(),
});
export type ReportContent = z.infer<typeof reportContentSchema>;

export type SentReport = Pick<ReportDocument, "id" | "service" | "month" | "state" | "content" | "contentVersion" | "pdfKey" | "sentAt">;

/** The document's content, or null when its version or shape is not one this screen can read. */
export function readContent(report: Pick<SentReport, "content" | "contentVersion">): ReportContent | null {
  if (report.contentVersion !== REPORT_CONTENT_VERSION) return null;
  const parsed = reportContentSchema.safeParse(report.content);
  return parsed.success ? parsed.data : null;
}

export interface ReportMonth {
  readonly key: MonthKey;
  readonly title: string;
  /** When the last of the month's reports was sent. */
  readonly sentAt: Date;
  /** The month's sent reports, one per service, in catalogue order. */
  readonly reports: readonly SentReport[];
}

/** Months that have at least one sent report, newest first. Anything not sent, or with a month that is not a month, is dropped. */
export function groupSentByMonth(documents: readonly SentReport[]): ReportMonth[] {
  const byMonth = new Map<MonthKey, SentReport[]>();
  for (const document of documents) {
    const key = monthKeyOfDocument(document.month);
    if (key === null || document.state !== "sent" || document.sentAt === null) continue;
    byMonth.set(key, [...(byMonth.get(key) ?? []), document]);
  }
  return [...byMonth.entries()]
    .map(([key, reports]) => ({
      key,
      title: monthTitle(key),
      sentAt: new Date(Math.max(...reports.map((report) => report.sentAt?.getTime() ?? 0))),
      reports: [...reports].sort((a, b) => SERVICE_ORDER.indexOf(a.service) - SERVICE_ORDER.indexOf(b.service)),
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** The list's Highlights column: the readable headlines of the month, in order. Null when none can be read. */
export function highlightsOf(month: ReportMonth): string | null {
  const lines = month.reports.flatMap((report) => readContent(report)?.headline ?? []);
  return lines.length === 0 ? null : lines.join(" ");
}

/** "3 Nov 2026", the day a report was sent, in India's time (where the team works). */
export function formatSentDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
}
