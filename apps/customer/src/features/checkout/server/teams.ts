import "server-only";
import type { CustomerCardInput } from "@brandbasket/shared/lib/customer-alert-card";
import { announceCustomerEvent } from "@brandbasket/shared/server/customer-alerts";
import { announcePayment } from "@brandbasket/shared/server/payment-alerts";
import { serverEnv } from "@/lib/env";
import { reportError } from "@/lib/report";
import { adminOrigin } from "./admin-origin";
import { getStaffDb } from "./db";

/*
 * Ported from apps/platform lib/server/teams.ts (the two announcements checkout makes). Reads the channel's sealed address on
 * the staff connection, because it sits in staff-only site_settings. Best-effort: never throws, a failure goes to Sentry.
 */

/** Tells the Payments channel about a payment that has just been recorded. Call it after the payment's transaction has committed. */
export async function announcePaymentToTeams(paymentId: string): Promise<void> {
  try {
    await announcePayment(getStaffDb(), serverEnv().BETTER_AUTH_SECRET, paymentId, adminOrigin());
  } catch (error) {
    reportError(error, { area: "checkout.teams-payment" });
  }
}

/** Tells the Customers channel that a customer sent their website details. Call it after the change has committed. */
export async function announceCustomerToTeams(event: Pick<CustomerCardInput, "event" | "facts" | "text" | "buttons"> & { readonly businessId: string }): Promise<void> {
  try {
    await announceCustomerEvent(getStaffDb(), serverEnv().BETTER_AUTH_SECRET, event, adminOrigin());
  } catch (error) {
    reportError(error, { area: "checkout.teams-customer" });
  }
}
