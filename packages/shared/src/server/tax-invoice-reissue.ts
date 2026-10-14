import "server-only";
import { addMonthsUtc, chargedAmountCents } from "@fynix/billing";
import {
  findAddOnSubscriptionForPayment,
  findChargeByPaymentId,
  findPlanById,
  findSubscriptionById,
  listPaymentsWithoutTaxInvoice,
  type Payment,
  type Plan,
  type ScopedTransaction,
  type Subscription,
  type TaxInvoice,
} from "@fynix/db";
import { issueTaxInvoice, type InvoiceSource } from "./tax-invoicing";

/** The payment is not one staff can invoice now: it has its invoice, gets none (D1), or is from before invoicing (D17). */
export class NoMissingInvoiceError extends Error {
  constructor() {
    super("This payment has no missing invoice");
    this.name = "NoMissingInvoiceError";
  }
}

/** No price this code knows explains what the payment took (a plan changed since, say). Engineering issues it by hand. */
export class InvoiceSourceMismatchError extends Error {
  constructor(kind: string) {
    super(`No price explains this ${kind} payment`);
    this.name = "InvoiceSourceMismatchError";
  }
}

/** The payment is of a kind this code cannot rebuild an invoice for (an `extra_publish` payment). Engineering issues it by hand. */
export class UnsupportedPaymentKindError extends Error {
  constructor(kind: string) {
    super(`A ${kind} payment cannot be rebuilt into an invoice`);
    this.name = "UnsupportedPaymentKindError";
  }
}

/** One price a payment may have been charged at: what an InvoiceSource needs besides the plan and the period. */
interface Price {
  readonly netAmountCents: number;
  readonly discountAmountCents: number;
  readonly retentionDiscountCents: number;
}

/**
 * The prices a payment of this kind may have been charged at, most likely first. The payment row does not keep the
 * price it was charged at, and a subscription's discount can change after a payment (a stay offer is added), so a
 * payment is tried against what the subscription holds now and then against what it held before.
 */
function candidatePrices(kind: Payment["kind"], plan: Plan, subscription: Subscription): readonly Price[] {
  const couponCents = subscription.discountAmountCents - subscription.retentionDiscountCents;
  switch (kind) {
    case "initial":
      return [
        { netAmountCents: plan.initialAmountCents, discountAmountCents: couponCents, retentionDiscountCents: 0 },
        { netAmountCents: plan.initialAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 },
      ];
    case "renewal":
      return [
        {
          netAmountCents: plan.recurringAmountCents,
          discountAmountCents: subscription.discountAmountCents,
          retentionDiscountCents: subscription.retentionDiscountCents,
        },
        { netAmountCents: plan.recurringAmountCents, discountAmountCents: couponCents, retentionDiscountCents: 0 },
        { netAmountCents: plan.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 },
      ];
    case "reactivation":
      return [{ netAmountCents: plan.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 }];
    default:
      return [];
  }
}

/** The first price whose charged amount is exactly what the payment took. A discount that leaves nothing never matches. */
function matching(payment: Payment, plan: Plan, prices: readonly Price[]): Price | null {
  for (const price of prices) {
    if (price.discountAmountCents >= price.netAmountCents) continue;
    if (chargedAmountCents(price.netAmountCents, price.discountAmountCents, plan.taxRateBasisPoints) === payment.amountCents) return price;
  }
  return null;
}

/**
 * What a recorded payment bought, rebuilt from the database for an invoice issued after the fact. The payment row
 * does not keep the price it was charged at, so the candidates are tried in order and only an exact match is used:
 * the invoice then explains the charge to the paisa, as buildTaxInvoice also checks. The period is the payment date
 * plus the plan's initial term (a first payment) or one month, since the provider's cycle dates are not kept.
 */
async function sourceFor(tx: ScopedTransaction, payment: Payment): Promise<InvoiceSource> {
  // Nothing records a payment of this kind today (the value is left from the first billing tables), so there is no
  // price to try; saying so beats reporting that "figures do not match".
  if (payment.kind === "extra_publish") throw new UnsupportedPaymentKindError(payment.kind);
  if (payment.kind === "charge") {
    const charge = await findChargeByPaymentId(tx, payment.businessId, payment.id);
    if (charge === null) throw new InvoiceSourceMismatchError("charge");
    return { kind: "charge", chargeId: charge.id };
  }
  if (payment.kind === "add_on") {
    // The add-on row holds the price it was bought at, so there is nothing to try. Razorpay's exact cycle is not kept per
    // payment, so the period is the month from the day paid, as for a renewal.
    const addOn = await findAddOnSubscriptionForPayment(tx, payment.id);
    if (addOn === null || payment.paidAt === null) throw new InvoiceSourceMismatchError(payment.kind);
    return { kind: "add_on", addOnSubscriptionId: addOn.id, periodStart: payment.paidAt, periodEnd: addMonthsUtc(payment.paidAt, 1) };
  }
  const subscription = payment.subscriptionId === null ? null : await findSubscriptionById(tx, payment.subscriptionId);
  const plan = subscription === null ? null : await findPlanById(tx, subscription.planId);
  if (subscription === null || plan === null || payment.paidAt === null) throw new InvoiceSourceMismatchError(payment.kind);
  const price = matching(payment, plan, candidatePrices(payment.kind, plan, subscription));
  if (price === null) throw new InvoiceSourceMismatchError(payment.kind);
  const initial = payment.kind === "initial";
  return {
    kind: "plan",
    plan,
    ...price,
    monthly: !initial || plan.initialTermMonths === 1,
    periodStart: payment.paidAt,
    periodEnd: addMonthsUtc(payment.paidAt, initial ? plan.initialTermMonths : 1),
  };
}

/**
 * Issues the invoice a payment is missing, dated `issuedAt` (D16), in the caller's staff transaction, which must hold
 * the business's billing lock. The payment must be one the business is listed as missing an invoice for. Throws rather
 * than logging: staff see why on the client page.
 */
export async function issueMissingTaxInvoice(
  tx: ScopedTransaction,
  businessId: string,
  paymentId: string,
  issuedAt: Date,
): Promise<TaxInvoice> {
  const payment = (await listPaymentsWithoutTaxInvoice(tx, businessId)).find((candidate) => candidate.id === paymentId);
  if (payment === undefined) throw new NoMissingInvoiceError();
  const result = await issueTaxInvoice(tx, payment, await sourceFor(tx, payment), { issuedAt });
  // Not issued by this call means another issuer got there first: the payment is no longer missing its invoice.
  if (result === null || !result.issued) throw new NoMissingInvoiceError();
  return result.invoice;
}
