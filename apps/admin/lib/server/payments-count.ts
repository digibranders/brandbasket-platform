import "server-only";
import { countPaymentsNeedingStaff } from "@brandbasket/db";
import { resolveRegisterMonth } from "@/lib/invoice-register-view";
import { paymentMonthBounds } from "@/lib/payments-view";
import { getStaffDb } from "./db";

/** The Payments rail count: payments still flagged, from any month, plus this month's failures (India's month). */
export async function readPaymentsCount(now: Date = new Date()): Promise<number> {
  const month = resolveRegisterMonth(undefined, now) ?? "";
  const bounds = paymentMonthBounds(month);
  if (bounds === null) throw new RangeError(`No month for ${now.toISOString()}`);
  return countPaymentsNeedingStaff(getStaffDb(), bounds.from);
}
