import "server-only";
import type { RazorpayWebhookEvent } from "@brandbasket/billing";
import { findChargeByProviderOrder, recordFailedPayment, type FailedPaymentOutcome } from "@brandbasket/db";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";
import { alertTeams } from "./teams";
import { paymentFailedTeamsCard } from "./teams-cards";

export type RazorpayPaymentFailed = Extract<RazorpayWebhookEvent, { readonly kind: "payment-failed" }>;

/**
 * Records a failed Razorpay payment on the client's payments and posts a System card. The business is the charge's (a
 * failed extra, matched by its order) or the one the payment's notes name. shortcut: a failed subscription renewal
 * whose payment carries neither is not tied to a client, only logged and alerted; fetch the Razorpay invoice by its
 * invoice_id when staff ask for those to be matched.
 */
export async function recordRazorpayPaymentFailure(event: RazorpayPaymentFailed): Promise<void> {
  const db = getStaffDb();
  const charge = event.orderId === null ? null : await findChargeByProviderOrder(db, "razorpay", event.orderId);
  const businessId = charge?.businessId ?? event.businessId;
  const outcome: FailedPaymentOutcome =
    businessId === null
      ? "unknown-business"
      : await recordFailedPayment(db, {
          businessId,
          provider: "razorpay",
          providerPaymentId: event.paymentId,
          kind: charge === null ? "renewal" : "charge",
          amountCents: event.amountCents,
          currency: event.currency,
          failureReason: event.failureReason,
          failedAt: event.failedAt,
        });
  // A retried delivery: the alert went out the first time.
  if (outcome === "already-recorded") return;
  if (outcome === "unknown-business") {
    logBillingEvent("warn", "confirmation-refused", {
      businessId: "unknown",
      subscriptionId: null,
      provider: "razorpay",
      providerPaymentId: event.paymentId,
      reason: "unmatched-payment-failure",
    });
  }
  const consolePath = outcome === "recorded" && businessId !== null ? `/clients/${businessId}/billing` : "/payments";
  await alertTeams(
    "system",
    paymentFailedTeamsCard({
      amount: formatMoney(event.amountCents, event.currency),
      matched: outcome === "recorded",
      reason: event.failureReason,
      providerPaymentId: event.paymentId,
      consoleUrl: new URL(consolePath, serverEnv().ADMIN_ORIGIN).toString(),
    }),
  );
}
