import "server-only";
import { addMonthsUtc, chargedAmountCents } from "@brandbasket/billing";
import {
  findAddOnSubscriptionForPayment,
  findChargeByPaymentId,
  findPaymentInvoiceBasis,
  findPlanById,
  findSubscriptionById,
  listPaymentsWithoutTaxInvoice,
  type Payment,
  type ScopedTransaction,
  type TaxInvoice,
} from "@brandbasket/db";
import { z } from "zod";
import { issueTaxInvoice, type InvoiceSource } from "./tax-invoicing";

/** The jsonb a payment kept as its basis (PaymentInvoiceBasis), read as data: a row edited by hand or written by older code is refused, not trusted. */
const InvoiceBasisSchema = z.object({
  netAmountCents: z.number().int().nonnegative(),
  discountAmountCents: z.number().int().nonnegative(),
  retentionDiscountCents: z.number().int().nonnegative(),
  lines: z.array(
    z.object({
      addOn: z.string().min(1),
      listAmountCents: z.number().int().nonnegative(),
      offerDiscountAmountCents: z.number().int().nonnegative(),
      taxRateBasisPoints: z.number().int().nonnegative(),
    }),
  ),
});

/** The payment is not one staff can invoice now: it has its invoice, gets none (D1), or is from before invoicing (D17). */
export class NoMissingInvoiceError extends Error {
  constructor() {
    super("This payment has no missing invoice");
    this.name = "NoMissingInvoiceError";
  }
}

/**
 * What the payment kept of its own billing does not explain what it took, or it kept none (it was recorded before the lines
 * were kept). Engineering issues it by hand.
 */
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

/**
 * What a recorded payment bought, rebuilt from the database for an invoice issued after the fact. A plan payment is rebuilt
 * from the lines it was billed at, which the payment path kept beside it (savePaymentInvoiceBasis), never from the
 * subscription's rows as they stand now: a service dropped, the package offer forfeited or a code's discount ended since
 * would otherwise print a different invoice from the one the payment path would have issued. The lines must come to exactly
 * what the payment took, as buildTaxInvoice also checks, so the invoice explains the charge to the paisa. The period is the
 * payment date plus the plan's initial term (a first payment) or one month, since the provider's cycle dates are not kept.
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
  const kept = await findPaymentInvoiceBasis(tx, payment.id);
  const parsed = InvoiceBasisSchema.safeParse(kept);
  if (subscription === null || plan === null || !parsed.success || payment.paidAt === null) throw new InvoiceSourceMismatchError(payment.kind);
  const basis = parsed.data;
  const net = basis.netAmountCents + basis.lines.reduce((total, line) => total + line.listAmountCents - line.offerDiscountAmountCents, 0);
  // A discount that leaves nothing never matches (chargedAmountCents would refuse it).
  if (basis.discountAmountCents >= net || chargedAmountCents(net, basis.discountAmountCents, plan.taxRateBasisPoints) !== payment.amountCents) {
    throw new InvoiceSourceMismatchError(payment.kind);
  }
  const initial = payment.kind === "initial";
  return {
    kind: "plan",
    plan,
    bundledAddOns: basis.lines,
    netAmountCents: basis.netAmountCents,
    discountAmountCents: basis.discountAmountCents,
    retentionDiscountCents: basis.retentionDiscountCents,
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
