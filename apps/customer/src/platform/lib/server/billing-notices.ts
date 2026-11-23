import "server-only";
import { sendDueBillingNotices, type BillingNoticeReport } from "@brandbasket/shared/server/billing-notices";
import { customerEmailTransport } from "@/features/server-common/email";
import { serverEnv } from "@/lib/env";
import { getStaffDb } from "./db";

/**
 * The renewal reminder and plan lapsed sweep, run by the 15 minute email queue timer. It runs before the queue is drained, so a Brevo
 * outage does not stop the bell notices; the reminder email goes through the queue like any other mail. Never throws.
 */
export async function runBillingNotices(now: Date = new Date()): Promise<BillingNoticeReport> {
  try {
    const db = getStaffDb();
    return await sendDueBillingNotices(db, { send: (message) => customerEmailTransport(db).send(message), dashboardOrigin: serverEnv().APP_ORIGIN }, now);
  } catch (error) {
    console.error("[billing-notices] The sweep could not run.", { error: error instanceof Error ? error.name : "error" });
    return { reminders: 0, lapses: 0, failed: 1 };
  }
}
