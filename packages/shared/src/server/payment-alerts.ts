import "server-only";
import {
  findAddOnSubscriptionForPayment,
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
import { paymentTeamsCard, planStatusTeamsCard, type PlanStatusAlert } from "../lib/payment-alert-card";
import { sendTeamsAlert } from "./teams-alerts";

/** What was bought, by name: the services a plan payment billed, the add-on, or the one-off charge's description. */
async function servicesFor(db: Database, base: NonNullable<Awaited<ReturnType<typeof findPaymentAlertBase>>>): Promise<string[]> {
  const { payment } = base;
  const serviceName = (id: string): string => (isMonthlyAddOnId(id) ? addOnById(id).title : id);
  if (payment.kind === "add_on") {
    const addOn = await findAddOnSubscriptionForPayment(db, payment.id);
    return addOn === null ? [] : [serviceName(addOn.addOn)];
  }
  if (payment.kind === "charge" || payment.kind === "extra_publish") {
    const charge = await findChargeByPaymentId(db, payment.businessId, payment.id);
    return charge === null ? [] : [charge.description];
  }
  const basis = await findPaymentInvoiceBasis(db, payment.id);
  return basis === null ? [] : basis.lines.map((line) => serviceName(line.addOn));
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
    const [services, method, invoice] = await Promise.all([servicesFor(db, base), findPaymentForInvoice(db, paymentId), findTaxInvoiceByPaymentId(db, paymentId)]);
    const card = paymentTeamsCard({
      kind: payment.kind,
      amountCents: payment.amountCents,
      currency: payment.currency,
      attentionReason: payment.attentionReason,
      paymentNumber: base.captured,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      method,
      customer: { name: owner.name, email: owner.email, phone: owner.phone === null ? null : displayPhone(owner.phone).text },
      business: { name: business.name, websiteUrl: business.websiteUrl },
      services,
      invoice: invoice === null ? null : { number: invoice.number, gstCents: invoice.cgstCents + invoice.sgstCents + invoice.igstCents },
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
