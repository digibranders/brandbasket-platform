import "server-only";

/*
 * Ported from apps/platform lib/server/charges.ts: paying a charge and the fake provider's confirm. The Razorpay webhook that
 * records a paid order stays in apps/platform; opening the blog unlock charge belongs to the blog feature.
 */
import { CheckoutVerificationError, type ConfirmedChargePayment } from "@brandbasket/billing";
import {
  countPaidBlogBlocks,
  findChargeForBusiness,
  findTicketIdOfChangeCharge,
  listChargesForBusiness,
  lockBusinessForBilling,
  setChargeProviderOrder,
  withTenantScope,
  type Charge,
  type ChargePaymentOutcome,
  type PaymentMethodDetails,
  type Plan,
} from "@brandbasket/db";
import { blogAllowance, chargeLabel } from "@brandbasket/shared/lib/billing/charges";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { finishAddOnAfterPayment } from "@brandbasket/shared/server/basket-change";
import { recordChargePaymentWithInvoice } from "@brandbasket/shared/server/charge-payments";
import { basketDeps } from "./add-ons";
import { getBillingProvider } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { sendPaymentReceipt } from "./payment-emails";
import { announcePaymentToTeams } from "./teams";

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
 * so an id from another business finds nothing. The amount comes from the charge row, never the request. A Razorpay
 * order is opened once per charge: a repeat press (or a second tab) reuses it, because the webhook finds the charge by
 * the stored order id and a payment made on an order that was replaced would match nothing. The order id is recorded
 * on the charge before the customer is sent to pay, so the payment the provider reports can always be matched back.
 */
export async function startCustomerChargePayment(customer: GrantedCustomer, chargeId: string): Promise<ChargePaymentStart> {
  const { tenant, user } = customer;
  const readCharge = () => withTenantScope(getAppDb(), tenant, (tx) => findChargeForBusiness(tx, tenant.businessId, chargeId));
  const charge = await readCharge();
  if (charge === null) return { kind: "not-found" };
  if (charge.status !== "open") return { kind: "not-open" };

  const provider = getBillingProvider();
  const existingOrder = razorpayOrderOf(charge, provider.name);
  if (existingOrder !== null) return { kind: "razorpay", orderId: existingOrder, charge };

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
    // Two presses at once each open an order; only the first to record wins and the other goes on with the winner's.
    ...(provider.name === "razorpay" ? { onlyIfUnset: true } : {}),
  });
  if (!recorded) {
    if (provider.name !== "razorpay") return { kind: "not-open" };
    const current = await readCharge();
    const winner = current !== null && current.status === "open" ? razorpayOrderOf(current, provider.name) : null;
    return current !== null && winner !== null ? { kind: "razorpay", orderId: winner, charge: current } : { kind: "not-open" };
  }
  if (started.redirectTo !== null) return { kind: "redirect", url: started.redirectTo };
  return { kind: "razorpay", orderId: started.providerOrderId, charge };
}

/** The Razorpay order already opened for a charge, or null when there is none (or the provider is not Razorpay). */
function razorpayOrderOf(charge: Charge, providerName: string): string | null {
  return providerName === "razorpay" && charge.provider === "razorpay" ? charge.providerOrderId : null;
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
  const { outcome, newPaymentId } = await getStaffDb().transaction(async (tx) => {
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
              : recorded.outcome === "add-on-not-applied"
                ? "add-on-quote-stale"
                : "charge-amount-mismatch",
      });
    }
    return { outcome: recorded.outcome, newPaymentId: recorded.alreadyRecorded ? null : recorded.payment.id };
  });
  // Teams is told once the payment has committed, for a payment recorded for the first time.
  if (newPaymentId !== null) void announcePaymentToTeams(newPaymentId);
  // Only a charge that was paid is a receipt: a refused one is kept for staff and bought nothing.
  if (newPaymentId !== null && outcome === "paid") void sendPaymentReceipt(newPaymentId);
  // A paid add-on is on; the provider is told to bill it from the next renewal, with the payment's transaction committed.
  if (outcome === "paid") await finishAddOnAfterPayment(basketDeps(), { businessId: confirmed.businessId, chargeId: confirmed.chargeId, now });
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

/** The request a change quote's charge belongs to, so its payment returns to that request. Through row-level security. */
export async function loadTicketIdOfChangeCharge(tenant: TenantContext, chargeId: string): Promise<string | undefined> {
  return (await withTenantScope(getAppDb(), tenant, (tx) => findTicketIdOfChangeCharge(tx, tenant.businessId, chargeId))) ?? undefined;
}

/** The customer's blog allowance: how many posts they may have, from the plan and every block they have paid for. */
export async function customerBlogAllowance(customer: Pick<GrantedCustomer, "tenant">, plan: Plan): Promise<number> {
  const { tenant } = customer;
  const paidBlocks = await withTenantScope(getAppDb(), tenant, (tx) => countPaidBlogBlocks(tx, tenant.businessId));
  return blogAllowance(plan, paidBlocks);
}
