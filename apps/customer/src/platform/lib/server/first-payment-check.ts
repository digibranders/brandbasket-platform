import "server-only";
import { listUnpaidCheckouts } from "@brandbasket/db";
import { describeError, logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { LEADS_API_TOKEN_MIN_LENGTH } from "@/platform/lib/leads-api";
import { getBillingProvider } from "./billing";
import { getStaffDb } from "./db";
import { recordChargeFromRazorpay, recordUpfrontFromRazorpay } from "./razorpay-webhook-handler";

/*
 * The first payment check. A checkout takes its first payment (either upfront for a first-month offer or through the plan's own
 * first charge), and Razorpay reports it by webhook. If that webhook never arrives the customer has paid and the plan stays unpaid,
 * so every few minutes the checkouts still waiting are asked about at Razorpay, and a payment it holds is recorded through the
 * webhook's own path.
 */

/** How long a new checkout is left to its webhook before it is asked about. */
const SETTLE_MS = 10 * 60 * 1000;
/** The most checkouts one run asks about, so a backlog cannot run for ever. */
const BATCH = 100;

export interface FirstPaymentCheckReport {
  /** Checkouts still waiting for their first payment that were asked about. */
  readonly checked: number;
  /** Of those, the ones Razorpay held a captured payment for, now recorded. */
  readonly found: number;
  /** The ones Razorpay could not be asked about. */
  readonly failed: number;
}

/** The shared secret the check's caller sends. Unset or too short means the route refuses every request. */
export function firstPaymentCheckToken(): string | null {
  const token = process.env.PAYMENT_RECONCILE_TOKEN?.trim() ?? "";
  return token.length >= LEADS_API_TOKEN_MIN_LENGTH ? token : null;
}

/** One run: asks Razorpay about every checkout still waiting for its first payment. Nothing to do with another provider. */
export async function checkFirstPayments(now: Date): Promise<FirstPaymentCheckReport> {
  if (getBillingProvider().name !== "razorpay") return { checked: 0, found: 0, failed: 0 };
  const waiting = await listUnpaidCheckouts(getStaffDb(), { provider: "razorpay", now, settleMs: SETTLE_MS, limit: BATCH });
  let found = 0;
  let failed = 0;
  for (const checkout of waiting) {
    try {
      const recorded =
        checkout.firstPaymentCents === null
          ? await recordChargeFromRazorpay(checkout.providerSubscriptionId)
          : await recordUpfrontFromRazorpay(checkout.providerSubscriptionId);
      if (recorded) found += 1;
    } catch (error: unknown) {
      failed += 1;
      logBillingEvent("error", "first-payment-check-failed", {
        businessId: checkout.businessId,
        subscriptionId: checkout.subscriptionId,
        provider: "razorpay",
        providerSubscriptionId: checkout.providerSubscriptionId,
        ...describeError(error),
      });
    }
  }
  return { checked: waiting.length, found, failed };
}
