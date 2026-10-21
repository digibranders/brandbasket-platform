import "server-only";
import { rewardCentsFor } from "@brandbasket/billing";
import {
  findAffiliateAccrualContext,
  insertAffiliateEarning,
  type PaymentKind,
  type ScopedTransaction,
} from "@brandbasket/db";
import { logBillingEvent } from "./billing-log";

export interface AccruedPayment {
  readonly paymentId: string;
  readonly subscriptionId: string;
  /** A first payment is measured against the plan's initial price, a renewal against its recurring one. */
  readonly kind: PaymentKind;
}

export type AccrualOutcome =
  /** An earning was written for this payment. */
  | { readonly kind: "earned"; readonly amountCents: number }
  /** The subscription earns for nobody: no code, a coupon, or a reward that comes to nothing. */
  | { readonly kind: "none" }
  /** This payment had already earned, so nothing was written again. */
  | { readonly kind: "already-earned" }
  /** A flat reward in another currency than the payment: nothing was written, and it was logged for staff. */
  | { readonly kind: "currency-mismatch" }
  /** The member is past the months this affiliate is paid for. Their discount carries on; the affiliate's cut does not. */
  | { readonly kind: "months-complete"; readonly cycleNumber: number };

/**
 * Writes what an affiliate earned from one recorded payment, inside the transaction that recorded it, so a payment
 * and its earning exist together or not at all. Called by the one activation path for first payments and renewals
 * (billing-activation.ts), only for a payment recorded for the first time.
 *
 * Only the first `rewardCycles` of the member's paid months earn, when the affiliate has a limit; the member's
 * discount is not affected by it. The earning is the affiliate's reward as it stands now, applied to what the member
 * paid before GST and after their frozen discount: the subscription's service lines on top of the plan's own price (its
 * initial price for a first payment, its recurring one for a renewal; both 0 for the services plan). Worked out from the
 * prices rather than read back off the taxed payment, so no tax rounding is undone.
 */
export async function accrueAffiliateEarning(tx: ScopedTransaction, payment: AccruedPayment): Promise<AccrualOutcome> {
  const context = await findAffiliateAccrualContext(tx, payment.subscriptionId, payment.paymentId);
  if (context === null) return { kind: "none" };
  if (context.rewardCycles !== null && context.cycleNumber > context.rewardCycles) {
    return { kind: "months-complete", cycleNumber: context.cycleNumber };
  }

  if (context.reward.kind === "amount" && context.rewardCurrency !== context.planCurrency) {
    // The console refuses this combination; reaching it means a reward was edited around that check.
    logBillingEvent("warn", "affiliate-currency-mismatch", {
      affiliateId: context.affiliateId,
      paymentId: payment.paymentId,
      rewardCurrency: context.rewardCurrency,
      paymentCurrency: context.planCurrency,
    });
    return { kind: "currency-mismatch" };
  }

  const listPrice = (payment.kind === "initial" ? context.initialAmountCents : context.recurringAmountCents) + context.bundledAddOnNetCents;
  const basisCents = Math.max(0, listPrice - context.discountAmountCents);
  const amountCents = rewardCentsFor(context.reward, basisCents);
  if (amountCents === 0) return { kind: "none" };

  const written = await insertAffiliateEarning(tx, {
    affiliateId: context.affiliateId,
    referralCodeId: context.referralCodeId,
    businessId: context.businessId,
    paymentId: payment.paymentId,
    amountCents,
    currency: context.planCurrency,
    basisCents,
    cycleNumber: context.cycleNumber,
  });
  return written ? { kind: "earned", amountCents } : { kind: "already-earned" };
}
