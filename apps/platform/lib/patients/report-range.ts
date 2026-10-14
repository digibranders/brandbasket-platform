import { isIsoDate } from "@fynix/shared/lib/calendar/local-date";

/**
 * The Reports page's three ranges (`?range=month|quarter|year`), all in the business's own calendar and all ending
 * today: a report is about what has happened, so none of them reaches into bookings still to come.
 */
export const REPORT_RANGE_KEYS = ["month", "quarter", "year"] as const;
export type ReportRangeKey = (typeof REPORT_RANGE_KEYS)[number];

export const REPORT_RANGE_LABELS: Readonly<Record<ReportRangeKey, string>> = {
  month: "This month",
  quarter: "Last 3 months",
  year: "This year",
};

export interface ReportRange {
  readonly key: ReportRangeKey;
  /** First day, "YYYY-MM-DD", inclusive. */
  readonly from: string;
  /** Last day, "YYYY-MM-DD", inclusive: always `today`. */
  readonly to: string;
  readonly label: string;
}

function isReportRangeKey(value: string): value is ReportRangeKey {
  return (REPORT_RANGE_KEYS as readonly string[]).includes(value);
}

/** The first day of the month `monthsBack` months before `today`'s, "YYYY-MM-01". */
function firstOfMonth(today: string, monthsBack: number): string {
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1 - monthsBack;
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
}

/**
 * Reads `?range=` against the business-local `today` ("YYYY-MM-DD"). Anything missing, repeated or unknown falls
 * back to "This month", the page's default. "Last 3 months" is this month and the two before it, from the first of
 * the earliest, so its bars and numbers line up with whole calendar months.
 */
export function parseReportRange(raw: string | readonly string[] | undefined, today: string): ReportRange {
  if (!isIsoDate(today)) throw new RangeError(`Expected today as a YYYY-MM-DD date, received ${today}`);
  const key = typeof raw === "string" && isReportRangeKey(raw) ? raw : "month";
  const from = key === "month" ? firstOfMonth(today, 0) : key === "quarter" ? firstOfMonth(today, 2) : `${today.slice(0, 4)}-01-01`;
  return { key, from, to: today, label: REPORT_RANGE_LABELS[key] };
}
