/*
 * The clocks that start when a personal data breach is noticed. CERT-In Directions 2022: report within 6 hours of noticing.
 * DPDP Rules 2025 r.7: tell the Data Protection Board without delay, then send the detailed report within 72 hours; tell
 * each affected person without delay. The runbook is vps-setup/BREACH-RESPONSE.md; the register is the staff console's
 * Breaches page.
 */

export const CERT_IN_HOURS = 6;
export const BOARD_REPORT_HOURS = 72;

const HOUR_MS = 60 * 60 * 1000;

export interface BreachDeadlines {
  readonly certInBy: Date;
  readonly boardReportBy: Date;
}

/** The dates by which CERT-In and the Board's detailed report are due, counted from when the breach was found. */
export function breachDeadlines(detectedAt: Date): BreachDeadlines {
  return {
    certInBy: new Date(detectedAt.getTime() + CERT_IN_HOURS * HOUR_MS),
    boardReportBy: new Date(detectedAt.getTime() + BOARD_REPORT_HOURS * HOUR_MS),
  };
}

export type BreachDutyState = "done" | "done_on_time" | "done_late" | "due" | "overdue" | "due_without_delay";

/**
 * Where one duty stands: `reportedAt` is when it was done (null if not yet), `deadline` its limit (null for a duty owed
 * "without delay", which has no number of hours to count).
 */
export function breachDutyState(reportedAt: Date | null, deadline: Date | null, now: Date): BreachDutyState {
  if (deadline === null) return reportedAt === null ? "due_without_delay" : "done";
  if (reportedAt !== null) return reportedAt.getTime() <= deadline.getTime() ? "done_on_time" : "done_late";
  return now.getTime() <= deadline.getTime() ? "due" : "overdue";
}
