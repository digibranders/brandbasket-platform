import "server-only";
import {
  findAddOnSubscriptionForPayment,
  findBillingProfile,
  findBusinessAlertDetails,
  findChargeByPaymentId,
  findPaymentAlertBase,
  findPaymentForInvoice,
  findPaymentInvoiceBasis,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  type Database,
} from "@brandbasket/db";
import { addOnById, isMonthlyAddOnId } from "../lib/billing/add-ons";
import { displayPhone } from "./phone-display";
import { paymentTeamsCard, planStatusTeamsCard, type PaymentCardInput, type PaymentCardLine, type PlanStatusAlert } from "../lib/payment-alert-card";
import { sendTeamsAlert } from "./teams-alerts";

/** What was bought, as lines for the card: the services a plan payment billed, the add-on, or the one-off charge. */
async function linesFor(db: Database, base: NonNullable<Awaited<ReturnType<typeof findPaymentAlertBase>>>): Promise<{ lines: PaymentCardLine[]; code: PaymentCardInput["code"] }> {
  const { payment } = base;
  if (payment.kind === "add_on") {
    const addOn = await findAddOnSubscriptionForPayment(db, payment.id);
    if (addOn === null) return { lines: [], code: null };
    return { lines: [{ title: isMonthlyAddOnId(addOn.addOn) ? addOnById(addOn.addOn).title : addOn.addOn, listCents: addOn.listAmountCents, offerCents: addOn.offerDiscountAmountCents }], code: null };
  }
  if (payment.kind === "charge" || payment.kind === "extra_publish") {
    const charge = await findChargeByPaymentId(db, payment.businessId, payment.id);
    return { lines: charge === null ? [] : [{ title: charge.description, listCents: charge.amountCents, offerCents: 0 }], code: null };
  }
  const basis = await findPaymentInvoiceBasis(db, payment.id);
  if (basis === null) return { lines: [], code: null };
  return {
    lines: basis.lines.map((line) => ({ title: isMonthlyAddOnId(line.addOn) ? addOnById(line.addOn).title : line.addOn, listCents: line.listAmountCents, offerCents: line.offerDiscountAmountCents })),
    code: basis.code === undefined ? null : { code: basis.code, takesOffCents: basis.discountAmountCents - basis.retentionDiscountCents },
  };
}

/**
 * Tells the Payments channel that a payment was recorded, with everything staff need to follow it up: who paid, what for, how,
 * the invoice and where to open the client. Call it once the payment's transaction has committed, for a payment recorded for
 * the first time. Best-effort like every alert: it never throws, and a payment that cannot be described is logged and skipped.
 */
export async function announcePayment(db: Database, secret: string, paymentId: string, consoleOrigin: string): Promise<void> {
  try {
    const base = await findPaymentAlertBase(db, paymentId);
    if (base === null) return;
    const { payment, business, owner } = base;
    const [{ lines, code }, subscription, method, invoice, billing] = await Promise.all([
      linesFor(db, base),
      payment.subscriptionId === null ? null : findSubscriptionById(db, payment.subscriptionId),
      findPaymentForInvoice(db, paymentId),
      findTaxInvoiceByPaymentId(db, paymentId),
      findBillingProfile(db, payment.businessId),
    ]);
    const planPayment = payment.kind === "initial" || payment.kind === "renewal" || payment.kind === "reactivation";
    const card = paymentTeamsCard({
      kind: payment.kind,
      amountCents: payment.amountCents,
      currency: payment.currency,
      paidAt: payment.paidAt,
      attentionReason: payment.attentionReason,
      paymentNumber: base.captured,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      method,
      customer: { name: owner.name, email: owner.email, phone: owner.phone === null ? null : displayPhone(owner.phone).text },
      business: { name: business.name, websiteUrl: business.websiteUrl },
      lines,
      code,
      adCreditCents: payment.kind === "initial" && subscription !== null ? subscription.adCreditCents : 0,
      paidThrough: planPayment && subscription !== null ? subscription.paidThroughAt : null,
      invoice: invoice === null ? null : { number: invoice.number, totalCents: invoice.totalCents, gstCents: invoice.cgstCents + invoice.sgstCents + invoice.igstCents },
      billing: billing === null ? null : { legalName: billing.legalName, gstin: billing.gstin },
      consoleUrl: new URL(`/clients/${business.id}`, consoleOrigin).toString(),
    });
    await sendTeamsAlert(db, secret, "payments", card);
  } catch (error) {
    console.error("[teams-alert] A payment could not be announced.", { paymentId, error: error instanceof Error ? error.name : "error" });
  }
}

/**
 * Tells the Payments channel that a business's plan changed to a state staff should follow up: a charge being retried, billing
 * that stopped, or a plan that ended. Call it only when the status really changed. Best-effort: it never throws.
 */
export async function announcePlanStatus(
  db: Database,
  secret: string,
  change: { readonly businessId: string; readonly subscriptionId: string; readonly status: PlanStatusAlert; readonly providerStatus: string },
  consoleOrigin: string,
): Promise<void> {
  try {
    const [details, subscription] = await Promise.all([findBusinessAlertDetails(db, change.businessId), findSubscriptionById(db, change.subscriptionId)]);
    if (details === null) return;
    const { business, owner } = details;
    const card = planStatusTeamsCard({
      status: change.status,
      providerStatus: change.providerStatus,
      customer: { name: owner.name, email: owner.email, phone: owner.phone === null ? null : displayPhone(owner.phone).text },
      business: { name: business.name, websiteUrl: business.websiteUrl },
      paidThrough: subscription?.paidThroughAt ?? null,
      consoleUrl: new URL(`/clients/${business.id}`, consoleOrigin).toString(),
    });
    await sendTeamsAlert(db, secret, "payments", card);
  } catch (error) {
    console.error("[teams-alert] A plan change could not be announced.", { status: change.status, error: error instanceof Error ? error.name : "error" });
  }
}
