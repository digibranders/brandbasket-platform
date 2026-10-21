import type { AdCreditDue } from "@brandbasket/db";
import { formatCalendarDate } from "@brandbasket/shared/lib/format";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { packageLabel } from "./service-packages";

/** Dates are in India time, as everywhere else in the console. */
const INDIA_TIME = "Asia/Kolkata";

export interface AdCreditDueRow {
  readonly id: string;
  readonly businessId: string;
  readonly businessName: string;
  /** The services billed, as staff say them: "Website + Social". */
  readonly package: string;
  readonly amount: string;
  readonly paidThrough: string;
}

/** The "Ad credit due this month" list as lines of text, in the order given (listAdCreditDue returns them by business name). */
export function adCreditDueRows(due: readonly AdCreditDue[]): AdCreditDueRow[] {
  return due.map((row) => ({
    id: row.subscriptionId,
    businessId: row.businessId,
    businessName: row.businessName,
    package: packageLabel(row.services),
    amount: `${formatMoney(row.adCreditCents, row.currency)} a month`,
    paidThrough: row.currentPeriodEnd === null ? "No paid-through date" : `Paid through ${formatCalendarDate(row.currentPeriodEnd, INDIA_TIME)}`,
  }));
}
