import "server-only";
import { CheckoutVerificationError, type ConfirmedChargePayment } from "@fynix/billing";
import {
  countPaidBlogBlocks,
  findChargeByProviderOrder,
  findChargeForBusiness,
  listChargesForBusiness,
  lockBusinessForBilling,
  openBlogPostsCharge,
  setChargeProviderOrder,
  withTenantScope,
  type Charge,
  type ChargePaymentOutcome,
  type PaymentMethodDetails,
  type Plan,
} from "@fynix/db";
import { blogAllowance, chargeAmountCents, chargeLabel, chargePricing } from "@fynix/shared/lib/billing/charges";
import type { TenantContext } from "@fynix/shared/lib/access";
import { describeError, logBillingEvent } from "@fynix/shared/server/billing-log";
import { recordChargePaymentWithInvoice } from "@fynix/shared/server/charge-payments";
import { getBillingProvider } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { finishUpgradeForCharge } from "./plan-upgrade-finish";

/** How many open charges the Billing page lists. More than this many unpaid extras at once is not a real case. */
const OPEN_CHARGES_SHOWN = 20;

/** The signed-in customer's unpaid charges, newest first, read through row-level security. */
export async function listOpenCustomerCharges(customer: Pick<GrantedCustomer, "tenant">): Promise<Charge[]> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) =>
    listChargesForBusiness(tx, tenant.businessId, { status: "open", limit: OPEN_CHARGES_SHOWN }),
  );
}

/** Where paying a charge goes next. */
export type ChargePaymentStart =
  /** The provider's own page (the fake provider's test checkout). */
  | { readonly kind: "redirect"; readonly url: string }
  /** Open Razorpay Checkout on this order, from the pay page. */
  | { readonly kind: "razorpay"; readonly orderId: string; readonly charge: Charge }
  /** The charge is not this customer's, or does not exist. */
  | { readonly kind: "not-found" }
  /** Already paid or waived, so there is nothing to pay. */
  | { readonly kind: "not-open" };

/**
 * Opens a one-time payment for one of the customer's open charges. The charge is read through row-level security,
 * so an id from another business finds nothing. The amount comes from the charge row, never the request, and every
 * attempt records the provider's new order id on the charge (replacing the last one) before the customer is sent
 * to pay, so the payment the provider reports can always be matched back.
 */
export async function startCustomerChargePayment(customer: GrantedCustomer, chargeId: string): Promise<ChargePaymentStart> {
  const { tenant, user } = customer;
  const charge = await withTenantScope(getAppDb(), tenant, (tx) => findChargeForBusiness(tx, tenant.businessId, chargeId));
  if (charge === null) return { kind: "not-found" };
  if (charge.status !== "open") return { kind: "not-open" };

  const provider = getBillingProvider();
  const started = await provider.startChargePayment({
    businessId: tenant.businessId,
    businessName: tenant.businessName,
    email: user.email,
    chargeId: charge.id,
    description: chargeLabel(charge),
    amountCents: charge.amountCents,
    currency: charge.currency,
  });
  const recorded = await setChargeProviderOrder(getStaffDb(), {
    chargeId: charge.id,
    businessId: tenant.businessId,
    provider: provider.name,
    providerOrderId: started.providerOrderId,
  });
  // Paid or waived in the moment since it was read: send nobody to pay for it.
  if (!recorded) return { kind: "not-open" };
  if (started.redirectTo !== null) return { kind: "redirect", url: started.redirectTo };
  return { kind: "razorpay", orderId: started.providerOrderId, charge };
}

/** What confirming a charge payment came to, for the page to say. */
export type ChargeConfirmation = ChargePaymentOutcome | "invalid";

interface RecordInput {
  readonly confirmed: Pick<
    ConfirmedChargePayment,
    "businessId" | "chargeId" | "providerPaymentId" | "amountCents" | "currency" | "paidAt"
  >;
  readonly method: PaymentMethodDetails | null | undefined;
  readonly now: Date;
}

/** Records a verified charge payment under the business's billing lock, the lock every payment path takes. */
async function recordVerifiedChargePayment({ confirmed, method, now }: RecordInput): Promise<ChargePaymentOutcome> {
  const provider = getBillingProvider();
  const outcome = await getStaffDb().transaction(async (tx) => {
    await lockBusinessForBilling(tx, confirmed.businessId);
    const recorded = await recordChargePaymentWithInvoice(tx, {
      chargeId: confirmed.chargeId,
      businessId: confirmed.businessId,
      provider: provider.name,
      providerPaymentId: confirmed.providerPaymentId,
      amountCents: confirmed.amountCents,
      currency: confirmed.currency,
      paidAt: confirmed.paidAt,
      now,
      ...(method === undefined ? {} : { method }),
    });
    if (recorded.outcome !== "paid" && !recorded.alreadyRecorded) {
      logBillingEvent("warn", "confirmation-refused", {
        businessId: confirmed.businessId,
        subscriptionId: null,
        provider: provider.name,
        providerPaymentId: confirmed.providerPaymentId,
        chargeId: confirmed.chargeId,
        reason:
          recorded.outcome === "not-open"
            ? "charge-not-open"
            : recorded.outcome === "upgrade-not-applied"
              ? "upgrade-quote-stale"
              : "charge-amount-mismatch",
      });
    }
    return recorded.outcome;
  });
  // A paid move up to Premium: the client has Premium already (the payment's transaction set it); the provider is told
  // now, after that has committed. Harmless for any other charge, and safe to repeat for a redelivered payment.
  if (outcome === "paid") await finishUpgradeForCharge(confirmed.chargeId, now);
  return outcome;
}

/**
 * The fake provider's test checkout for a charge: verifies the signed link, checks it is for the signed-in
 * customer's business, and records the payment. A link for another business is refused without recording anything.
 */
export async function confirmFakeChargePayment(
  tenant: TenantContext,
  payload: unknown,
  now: Date,
): Promise<ChargeConfirmation> {
  let confirmed: ConfirmedChargePayment;
  try {
    confirmed = await getBillingProvider().confirmChargePayment(payload);
  } catch (error) {
    if (error instanceof CheckoutVerificationError) return "invalid";
    throw error;
  }
  if (confirmed.businessId !== tenant.businessId) return "invalid";
  return recordVerifiedChargePayment({ confirmed, method: confirmed.method, now });
}

/** A charge payment the customer's link is for, without recording it: what the test checkout page shows. */
export async function verifyChargePaymentFor(tenant: TenantContext, payload: unknown): Promise<ConfirmedChargePayment | null> {
  try {
    const confirmed = await getBillingProvider().confirmChargePayment(payload);
    return confirmed.businessId === tenant.businessId ? confirmed : null;
  } catch (error) {
    if (error instanceof CheckoutVerificationError) return null;
    throw error;
  }
}

/** A Razorpay `order.paid` event, already signature-verified and parsed. */
export interface RazorpayOrderPaid {
  readonly orderId: string;
  readonly paymentId: string;
  readonly amountCents: number;
  readonly currency: ConfirmedChargePayment["currency"];
  readonly paidAt: Date;
  readonly method: PaymentMethodDetails | null;
}

/**
 * Records a charge paid through Razorpay, from its signed webhook: the only trusted source of a paid charge on the
 * live path. An order we never opened is logged and ignored, so the webhook can still acknowledge it.
 */
export async function recordRazorpayChargePayment(event: RazorpayOrderPaid, now: Date): Promise<void> {
  const charge = await findChargeByProviderOrder(getStaffDb(), "razorpay", event.orderId);
  if (charge === null) {
    logBillingEvent("warn", "confirmation-refused", {
      businessId: "unknown",
      subscriptionId: null,
      provider: "razorpay",
      providerPaymentId: event.paymentId,
      reason: "unknown-charge-order",
    });
    return;
  }
  try {
    await recordVerifiedChargePayment({
      confirmed: {
        businessId: charge.businessId,
        chargeId: charge.id,
        providerPaymentId: event.paymentId,
        amountCents: event.amountCents,
        currency: event.currency,
        paidAt: event.paidAt,
      },
      method: event.method,
      now,
    });
  } catch (error) {
    logBillingEvent("error", "webhook-processing-failed", {
      businessId: charge.businessId,
      subscriptionId: null,
      provider: "razorpay",
      chargeId: charge.id,
      reason: "charge-payment-failed",
      ...describeError(error),
    });
    throw error;
  }
}

/** The customer's blog allowance: how many posts they may have, from the plan and every block they have paid for. */
export async function customerBlogAllowance(customer: Pick<GrantedCustomer, "tenant">, plan: Plan): Promise<number> {
  const { tenant } = customer;
  const paidBlocks = await withTenantScope(getAppDb(), tenant, (tx) => countPaidBlogBlocks(tx, tenant.businessId));
  return blogAllowance(plan, paidBlocks);
}

/**
 * The open charge that unlocks the next block of blog posts, adding it at the plan's price when there is none yet.
 * It is written through the staff connection, like every charge; the caller has already checked this is a paid
 * customer at their limit.
 */
export async function openBlogUnlock(tenant: TenantContext, plan: Plan): Promise<Charge> {
  const pricing = chargePricing("blog_posts", plan);
  if (pricing.unitAmountCents === null) throw new Error("Blog posts must have a price on the plan");
  return openBlogPostsCharge(getStaffDb(), {
    businessId: tenant.businessId,
    kind: "blog_posts",
    description: pricing.description,
    quantity: 1,
    unitAmountCents: pricing.unitAmountCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    amountCents: chargeAmountCents(pricing.unitAmountCents, 1, plan.taxRateBasisPoints),
    currency: plan.currency,
    createdByStaffId: null,
  });
}
