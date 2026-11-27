import "server-only";

/*
 * Plan 66, payment 1 of a paid deal: the advance. A one-time order tied to a `charges` row of kind `website_advance`, paid through the
 * same path as every other charge (startCustomerChargePayment, the order.paid webhook, the fake provider's confirm page). Recording the
 * payment opens the project and marks the advance paid, in recordChargePaymentWithInvoice.
 */
import {
  consumeRateLimit,
  findBillingState,
  findChargeForBusiness,
  findOpenPaymentLinkForBusiness,
  insertAdvanceCharge,
  lockBusinessForBilling,
  BillingBusinessNotFoundError,
  type Charge,
} from "@brandbasket/db";
import { addOnTaxRateBasisPoints } from "@brandbasket/shared/lib/billing/add-ons";
import { isWebsiteKind, WEBSITE_KIND_LABELS } from "@brandbasket/shared/lib/billing/website-kind";
import { businessDetails } from "@brandbasket/shared/lib/site-config";
import { chargePayPath } from "../rules/charge-notices";
import { billingDetailsMissing } from "./billing-details";
import { startCustomerChargePayment } from "./charges";
import { CHECKOUT_RATE_LIMIT, type CheckoutOutcome } from "./checkout";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

const TOO_MANY_ATTEMPTS = "That’s a lot of attempts in a short time. Please wait a little and try again.";
const NOTHING_TO_PAY_FOR = `There’s nothing to pay for right now. If you think that’s wrong, email us at ${businessDetails.email}.`;
const ALREADY_PAID = "Your advance is already paid. Open your dashboard to carry on.";
const BILLING_DETAILS_NEEDED = "Add your billing details to pay. Your GST invoice is made out from them and cannot be changed once it is issued.";
const COULD_NOT_OPEN = "We couldn’t open your payment just now. Please try again in a minute.";

function refused(message: string): CheckoutOutcome {
  return { kind: "refused", problem: { message, field: null } };
}

type Prepared = { readonly kind: "ready"; readonly charge: Charge } | { readonly kind: "refused"; readonly message: string };

/**
 * Starts payment 1 for the signed-in owner's open paid deal and sends them to the order. Checked on the server, whatever the page
 * showed: at most CHECKOUT_RATE_LIMIT attempts an hour per business, billing details saved (rupees), and then, under the business's billing
 * lock, that the open link is a paid deal bound to this business whose advance is not yet paid and whose business has no subscription
 * that was ever activated. The amount is the link's `advance_cents` and nothing else. The charge is added once and recorded on the link;
 * a retry reuses it while it is open and its amount and currency still match the link. The order is then started by
 * startCustomerChargePayment (its own provider call, order reuse and storing of the order id), and the customer goes to
 * /checkout/charges/<id>, which opens Razorpay or the fake provider's page and handles the return.
 */
export async function startAdvancePaymentFor(customer: GrantedCustomer, now: Date): Promise<CheckoutOutcome> {
  const { tenant } = customer;

  const limit = await consumeRateLimit(getAppDb(), `checkout:business:${tenant.businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);
  if (await billingDetailsMissing(customer)) return refused(BILLING_DETAILS_NEEDED);

  const prepared = await getStaffDb().transaction(async (tx): Promise<Prepared> => {
    await lockBusinessForBilling(tx, tenant.businessId);
    const state = await findBillingState(tx, tenant.businessId);
    if (state === null) throw new BillingBusinessNotFoundError(tenant.businessId);
    if (state.hasEverPaid) return { kind: "refused", message: NOTHING_TO_PAY_FOR };
    const link = await findOpenPaymentLinkForBusiness(tx, tenant.businessId, now);
    if (link === null || link.businessId !== tenant.businessId || link.dealType !== "paid" || link.advanceCents === null) {
      return { kind: "refused", message: NOTHING_TO_PAY_FOR };
    }
    if (link.advancePaidAt !== null) return { kind: "refused", message: ALREADY_PAID };
    if (link.websiteKind === null || !isWebsiteKind(link.websiteKind)) return { kind: "refused", message: NOTHING_TO_PAY_FOR };

    if (link.advanceChargeId !== null) {
      const existing = await findChargeForBusiness(tx, tenant.businessId, link.advanceChargeId);
      // The amount is never recomputed: a charge that is not open, or no longer says what the link says, is not paid.
      if (existing === null || existing.status !== "open" || existing.amountCents !== link.advanceCents || existing.currency !== link.currency) {
        return { kind: "refused", message: NOTHING_TO_PAY_FOR };
      }
      return { kind: "ready", charge: existing };
    }
    const charge = await insertAdvanceCharge(tx, {
      businessId: tenant.businessId,
      linkId: link.id,
      amountCents: link.advanceCents,
      currency: link.currency,
      description: `Website design and build: advance (${WEBSITE_KIND_LABELS[link.websiteKind]})`,
      taxRateBasisPoints: addOnTaxRateBasisPoints(link.currency),
    });
    return { kind: "ready", charge };
  });
  if (prepared.kind === "refused") return refused(prepared.message);

  const started = await startCustomerChargePayment(customer, prepared.charge.id);
  switch (started.kind) {
    case "redirect":
      return { kind: "redirect", url: started.url };
    case "razorpay":
      return { kind: "redirect", url: chargePayPath(started.charge.id) };
    case "not-found":
    case "not-open":
      return refused(COULD_NOT_OPEN);
    default: {
      const unhandled: never = started;
      throw new Error(`Unhandled charge payment start: ${JSON.stringify(unhandled)}`);
    }
  }
}
