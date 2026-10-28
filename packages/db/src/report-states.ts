/**
 * A monthly report's life, in the database's own words (migration 0201). No imports, so the console, the jobs, the
 * schema and the tests read one list. The arrows are exactly the ones the `report_documents_guard` trigger allows:
 * reports.integration.test.ts walks every pair against it. `sent` is final: a sent report is never edited.
 */

export const REPORT_SERVICES = ["website", "social", "search"] as const;
export type ReportService = (typeof REPORT_SERVICES)[number];

/** Where a number comes from: our own records, Search Console, or Analytics. */
export const REPORT_SOURCES = ["own", "gsc", "ga4"] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

/** The sources a customer or staff connect to Google, one row each per business. */
export const CONNECTED_SOURCES = ["gsc", "ga4"] as const;
export type ConnectedSource = (typeof CONNECTED_SOURCES)[number];

export const REPORT_STATES = ["draft", "held", "approved", "sent"] as const;
export type ReportState = (typeof REPORT_STATES)[number];

export const SOURCE_STATUSES = ["pending", "connected", "access_lost"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/** Where a report may go next. Staff hold a draft or approve it; only an approved report is sent, and it can be pulled back to held first. */
export function canMoveReport(from: ReportState, to: ReportState): boolean {
  if (from === to) return true;
  switch (from) {
    case "draft":
      return to === "held" || to === "approved";
    case "held":
      return to === "draft" || to === "approved";
    case "approved":
      return to === "held" || to === "sent";
    case "sent":
      return false;
  }
}
