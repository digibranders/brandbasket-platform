import "server-only";
import { addMonthsUtc, chargedAmountCents, CheckoutVerificationError, hasBillingAccess, type ConfirmedPayment } from "@firstfold/billing";
import {
  findBillingState,
  findOpenProject,
  findPaymentByProviderId,
  findPlanById,
  findSubscriptionByProviderId,
  flagPaymentForAttention,
  isUnappliedReason,
  lockBusinessForBilling,
  OnboardingLockedError,
  ProjectNotInOnboardingError,
  recordUnappliedPayment,
  withCustomerRole,
  type BillingProviderName,
  type Plan,
  type ScopedTransaction,
  type Subscription,
  type UnappliedPaymentReason,
} from "@firstfold/db";
import type { TenantContext } from "@firstfold/shared/lib/access";
import { isOnboardingLocked } from "@/lib/onboarding/snapshot";
import { getBillingProvider } from "./billing";
import { activateFirstPayment, activateReactivationPayment } from "@firstfold/shared/server/billing-activation";
import { describeError, logBillingEvent } from "@firstfold/shared/server/billing-log";
import { getStaffDb } from "./db";
import { sendOnboardingWithin, StepRefusedError } from "./onboarding";
import { syncTenantForBusiness } from "./payload-tenant-sync";

/**
 * What happened to the onboarding when a first payment was recorded:
 * - `sent`: submitted in the same transaction as the payment.
 * - `missing`: the checklist no longer passed (answers changed in another tab), so the project stays open.
 * - `not-open`: there was nothing open to send (already sent before payment was required, or no project).
 * - `failed`: sending failed for an unexpected reason; logged, flagged for staff, and the project stays open.
 * In every case but `sent`, a paid customer can send it from Check and send without paying again.
 */
export type SubmissionResult = "sent" | "missing" | "not-open" | "failed";

export type PaymentConfirmation =
  /** Not a payment this customer may confirm. Nothing was written. */
  | { readonly kind: "invalid" }
  /** Recorded now. */
  | { readonly kind: "paid"; readonly submission: SubmissionResult; readonly projectStillOpen: boolean }
  /**
   * Recorded now, and it bought the Premium membership from a free listing account: the business has just become a
   * website client with its setup still to do, so there was nothing to send.
   */
  | { readonly kind: "membership-opened" }
  /** Recorded now, and it brought back a plan that had lapsed (a reactivation). There is no setup to send. */
  | { readonly kind: "reactivated" }
  /** This payment had already been recorded (a refresh or a second click). Nothing was written. */
  | { readonly kind: "already-recorded"; readonly projectStillOpen: boolean }
  /**
   * The provider took the money, but it could not buy anything: the checkout had been replaced or cancelled, the
   * business already had access, or the amount was not the plan's. It is recorded for staff and nothing was
   * activated. The customer is told the payment arrived and the team will be in touch.
   */
  | { readonly kind: "needs-attention" };

const INVALID: PaymentConfirmation = { kind: "invalid" };
const NEEDS_ATTENTION: PaymentConfirmation = { kind: "needs-attention" };

/**
 * Why a confirmation that passed the provider's signature check was refused or set aside. Logged, never shown.
 * The unapplied reasons are recorded as payments too; the others refer to nothing this business owns.
 */
type RefusalReason =
  | UnappliedPaymentReason
  | "verification-failed-after-signature"
  | "other-business-token"
  | "other-business-payment"
  | "other-business-subscription"
  | "unknown-subscription";

interface RefusalContext {
  readonly businessId: string;
  readonly subscriptionId: string | null;
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
  readonly providerPaymentId: string;
}

/** One log line per refused confirmation. The token is never among the fields: it is the credential. */
function logRefusal(context: RefusalContext, reason: RefusalReason): void {
  logBillingEvent("warn", "confirmation-refused", { ...context, reason });
}

/**
 * Checks what the provider handed back without writing anything: the signature, the expiry, and that it belongs to
 * the signed-in customer's business. Returns null when any of that fails. A correctly signed confirmation that is
 * refused (expired, or for another business) is also logged. The payload is never included in an error or a log.
 */
export async function verifyCheckoutFor(tenant: TenantContext, payload: unknown): Promise<ConfirmedPayment | null> {
  const provider = getBillingProvider();
  let confirmed: ConfirmedPayment;
  try {
    confirmed = await provider.confirmCheckout(payload);
  } catch (error) {
    if (!(error instanceof CheckoutVerificationError)) throw error;
    if (error.signatureVerified) {
      // The message names the reason (expired, say) and never the payload.
      logBillingEvent("warn", "confirmation-refused", {
        businessId: tenant.businessId,
        subscriptionId: null,
        provider: provider.name,
        reason: "verification-failed-after-signature" satisfies RefusalReason,
        detail: error.message,
      });
    }
    return null;
  }
  if (confirmed.businessId === tenant.businessId) return confirmed;
  logBillingEvent("warn", "confirmation-refused", {
    businessId: tenant.businessId,
    tokenBusinessId: confirmed.businessId,
    subscriptionId: null,
    provider: provider.name,
    providerSubscriptionId: confirmed.providerSubscriptionId,
    providerPaymentId: confirmed.providerPaymentId,
    reason: "other-business-token" satisfies RefusalReason,
  });
  return null;
}

async function projectStillOpen(tx: ScopedTransaction, tenant: TenantContext): Promise<boolean> {
  const project = await withCustomerRole(tx, tenant, findOpenProject);
  return !isOnboardingLocked(project);
}

/**
 * Sends onboarding as the customer, inside the payment's transaction. A refusal only rolls back the savepoint
 * withCustomerRole opened, so the payment recorded before it stays. An unexpected failure is logged and the payment
 * is flagged for staff.
 */
async function sendAfterPayment(
  tx: ScopedTransaction,
  tenant: TenantContext,
  paymentId: string,
  now: Date,
): Promise<SubmissionResult> {
  try {
    await withCustomerRole(tx, tenant, (customerTx) => sendOnboardingWithin(customerTx, now));
    return "sent";
  } catch (error) {
    if (error instanceof StepRefusedError) return "missing";
    if (error instanceof OnboardingLockedError || error instanceof ProjectNotInOnboardingError) return "not-open";
    // The money is real and already recorded in this transaction; losing it over a failed submission would be the
    // worse outcome. The customer lands on Check and send, where sending works without paying again, and staff see
    // the payment on their "Payments needing attention" list.
    logBillingEvent("error", "submission-failed-after-payment", {
      businessId: tenant.businessId,
      paymentId,
      ...describeError(error),
    });
    await flagPaymentForAttention(tx, {
      paymentId,
      businessId: tenant.businessId,
      reason: "submission_failed",
      now,
    });
    return "failed";
  }
}

type Applicability =
  /** `reactivating`: the business paid before and lapsed, so this is a reactivation, not a first payment. */
  | { readonly kind: "applies"; readonly plan: Plan; readonly reactivating: boolean }
  | { readonly kind: "unapplied"; readonly reason: UnappliedPaymentReason };

/**
 * Whether a verified payment for this business can activate `subscription`, and on which plan. Access is checked
 * first: money arriving for a business that already has access is a duplicate, whatever it paid for.
 */
async function applicability(
  tx: ScopedTransaction,
  businessId: string,
  subscription: Subscription,
  confirmed: ConfirmedPayment,
  now: Date,
): Promise<Applicability> {
  const state = await findBillingState(tx, businessId);
  if (state !== null && hasBillingAccess(state.subscription, now)) return { kind: "unapplied", reason: "already_paid" };
  if (subscription.status !== "incomplete") return { kind: "unapplied", reason: "checkout_replaced" };
  const plan = await findPlanById(tx, subscription.planId);
  if (plan === null || plan.currency !== confirmed.currency) return { kind: "unapplied", reason: "amount_mismatch" };
  const reactivating = state?.hasEverPaid === true;
  const expected = expectedFirstPaymentCents(plan, subscription.discountAmountCents, reactivating);
  if (expected !== confirmed.amountCents) return { kind: "unapplied", reason: "amount_mismatch" };
  return { kind: "applies", plan, reactivating };
}

/**
 * What the provider was asked to take for this checkout: the plan's first payment (its monthly price, for a
 * reactivation) less the subscription's referral discount, plus the plan's tax (₹2,999 + 18% GST is ₹3,538.82). The
 * same chargedAmountCents the checkout and the webhook use, so a payment is judged against exactly what was charged.
 * Null when the discount leaves nothing to charge, which no payment can match.
 */
function expectedFirstPaymentCents(plan: Plan, discountAmountCents: number, reactivating: boolean): number | null {
  const price = reactivating ? plan.recurringAmountCents : plan.initialAmountCents;
  try {
    return chargedAmountCents(price, discountAmountCents, plan.taxRateBasisPoints);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/**
 * Confirms a first payment for the signed-in customer and, in the same staff transaction, sends their onboarding.
 *
 * Under a per-business lock it:
 * 1. verifies the provider's payload (signature, expiry, and that it is this customer's business);
 * 2. returns `already-recorded` (or `needs-attention`, for money that bought nothing) if this provider payment is
 *    already stored, writing nothing;
 * 3. checks the subscription it pays for belongs to this business, and refuses (and logs) one that does not;
 * 4. if the business already has access, the subscription is no longer an unpaid checkout (it was replaced or
 *    cancelled), or the amount is not the plan's first payment, records the money flagged for staff, activates
 *    nothing, logs it, and returns `needs-attention`: the provider has taken it, so dropping it is not an option;
 * 5. otherwise records the payment, opens the subscription for the plan's own initial term and marks the lead paid;
 * 6. switches to the customer's role (withCustomerRole) and sends onboarding through the same guarded transition and
 *    checklist as the Send button. If that is refused, only the savepoint is rolled back.
 *
 * A free listing account buying the Premium membership pays before it has a project. Step 5 then also makes it a
 * website client and opens its setup (activateFirstPayment), step 6 is skipped because nothing has been answered yet,
 * and once everything has committed the business is given the Payload tenant every client has.
 *
 * Everything commits together or not at all: an error outside step 6 rolls back the payment too, and the provider's
 * payload can be confirmed again.
 *
 * The provider notifying us directly (Razorpay's webhook) must reach the same outcomes when its adapter is built.
 */
export async function confirmFirstPayment(
  tenant: TenantContext,
  payload: unknown,
  now: Date,
): Promise<PaymentConfirmation> {
  const confirmed = await verifyCheckoutFor(tenant, payload);
  if (confirmed === null) return INVALID;
  const provider = getBillingProvider();
  const context: RefusalContext = {
    businessId: tenant.businessId,
    subscriptionId: null,
    provider: provider.name,
    providerSubscriptionId: confirmed.providerSubscriptionId,
    providerPaymentId: confirmed.providerPaymentId,
  };

  const confirmation = await getStaffDb().transaction(async (tx): Promise<PaymentConfirmation> => {
    await lockBusinessForBilling(tx, tenant.businessId);

    const existing = await findPaymentByProviderId(tx, provider.name, confirmed.providerPaymentId);
    if (existing !== null) {
      if (existing.businessId !== tenant.businessId) {
        logRefusal({ ...context, subscriptionId: existing.subscriptionId }, "other-business-payment");
        return INVALID;
      }
      if (isUnappliedReason(existing.attentionReason)) return NEEDS_ATTENTION;
      return { kind: "already-recorded", projectStillOpen: await projectStillOpen(tx, tenant) };
    }

    const subscription = await findSubscriptionByProviderId(tx, provider.name, confirmed.providerSubscriptionId);
    if (subscription === null) {
      logRefusal(context, "unknown-subscription");
      return INVALID;
    }
    const withSubscription = { ...context, subscriptionId: subscription.id };
    if (subscription.businessId !== tenant.businessId) {
      logRefusal(withSubscription, "other-business-subscription");
      return INVALID;
    }

    const verdict = await applicability(tx, tenant.businessId, subscription, confirmed, now);
    if (verdict.kind === "unapplied") {
      const { reason } = verdict;
      await recordUnappliedPayment(tx, {
        businessId: tenant.businessId,
        subscriptionId: subscription.id,
        provider: provider.name,
        providerPaymentId: confirmed.providerPaymentId,
        kind: "initial",
        amountCents: confirmed.amountCents,
        currency: confirmed.currency,
        paidAt: confirmed.paidAt,
        reason,
        now,
        ...(confirmed.method === undefined ? {} : { method: confirmed.method }),
      });
      logRefusal(withSubscription, reason);
      return NEEDS_ATTENTION;
    }

    if (verdict.reactivating) {
      // Back on today's plan for a month from now: nothing to send, the project is already live.
      await activateReactivationPayment(tx, {
        businessId: tenant.businessId,
        subscriptionId: subscription.id,
        plan: verdict.plan,
        provider: provider.name,
        providerPaymentId: confirmed.providerPaymentId,
        paidAt: confirmed.paidAt,
        paidThroughAt: addMonthsUtc(confirmed.paidAt, 1),
        ...(confirmed.method === undefined ? {} : { method: confirmed.method }),
      });
      return { kind: "reactivated" };
    }

    const activation = await activateFirstPayment(tx, {
      businessId: tenant.businessId,
      subscriptionId: subscription.id,
      plan: verdict.plan,
      provider: provider.name,
      providerPaymentId: confirmed.providerPaymentId,
      paidAt: confirmed.paidAt,
      // The subscription's frozen referral discount, exactly as the webhook passes it: activateFirstPayment records
      // the amount taken from it, so leaving it out would record a discounted payment at the full price.
      discountAmountCents: subscription.discountAmountCents,
      ...(confirmed.method === undefined ? {} : { method: confirmed.method }),
    });

    if (activation.openedMembership !== null) return { kind: "membership-opened" };

    const submission = await sendAfterPayment(tx, tenant, activation.payment.id, now);
    return {
      kind: "paid",
      submission,
      projectStillOpen: submission === "sent" ? false : await projectStillOpen(tx, tenant),
    };
  });

  // After the commit, as for a setup link: Payload's database is not ours, and the sync logs rather than throws.
  if (confirmation.kind === "membership-opened") {
    await syncTenantForBusiness({ businessId: tenant.businessId, name: tenant.businessName });
  }
  return confirmation;
}
