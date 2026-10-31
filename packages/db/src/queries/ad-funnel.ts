import { and, asc, gte, inArray, like, lt, notInArray } from "drizzle-orm";
import type { Database } from "../client";
import { leads, payments, signupAttribution, taxInvoices } from "../schema";
import { PLAN_EXCLUDED_PAYMENT_KINDS, paymentWasApplied } from "./billing";

/** What the ad results (plan 59) are worked out from; packages/shared/src/lib/ad-funnel.ts does the counting. */
export interface AdFunnelData {
  readonly leads: readonly { readonly message: string | null }[];
  readonly accounts: readonly {
    readonly businessId: string;
    readonly utmSource: string | null;
    readonly utmMedium: string | null;
    readonly utmCampaign: string | null;
    readonly utmContent: string | null;
  }[];
  /** Each of those accounts' first applied plan payment, with the GST on its tax invoice when it has one. */
  readonly firstPayments: readonly { readonly businessId: string; readonly currency: "INR" | "USD"; readonly amountCents: number; readonly gstCents: number | null }[];
}

/**
 * The leads the ad landing page sent, and the accounts opened by someone who came from an ad, from `from` up to `to`, with
 * those accounts' first payments. Staff connection.
 */
export async function listAdFunnelData(db: Database, from: Date, to: Date): Promise<AdFunnelData> {
  const [adLeads, accounts] = await Promise.all([
    db.select({ message: leads.message }).from(leads).where(and(like(leads.message, "Ad landing page%"), gte(leads.createdAt, from), lt(leads.createdAt, to))),
    db
      .select({ businessId: signupAttribution.businessId, utmSource: signupAttribution.utmSource, utmMedium: signupAttribution.utmMedium, utmCampaign: signupAttribution.utmCampaign, utmContent: signupAttribution.utmContent })
      .from(signupAttribution)
      .where(and(gte(signupAttribution.capturedAt, from), lt(signupAttribution.capturedAt, to))),
  ]);
  if (accounts.length === 0) return { leads: adLeads, accounts, firstPayments: [] };

  // Oldest first, so the first row seen for a business is its first payment.
  const paid = await db
    .select({ id: payments.id, businessId: payments.businessId, currency: payments.currency, amountCents: payments.amountCents })
    .from(payments)
    .where(
      and(
        inArray(payments.businessId, accounts.map((account) => account.businessId)),
        inArray(payments.status, ["captured", "refunded"]),
        notInArray(payments.kind, [...PLAN_EXCLUDED_PAYMENT_KINDS]),
        paymentWasApplied(),
      ),
    )
    .orderBy(asc(payments.paidAt), asc(payments.id));
  const first = new Map<string, (typeof paid)[number]>();
  for (const payment of paid) if (!first.has(payment.businessId)) first.set(payment.businessId, payment);

  const chosen = [...first.values()];
  const invoices = chosen.length === 0 ? [] : await db.select({ paymentId: taxInvoices.paymentId, cgst: taxInvoices.cgstCents, sgst: taxInvoices.sgstCents, igst: taxInvoices.igstCents }).from(taxInvoices).where(inArray(taxInvoices.paymentId, chosen.map((payment) => payment.id)));
  const gstOf = new Map(invoices.map((invoice) => [invoice.paymentId, invoice.cgst + invoice.sgst + invoice.igst]));
  return {
    leads: adLeads,
    accounts,
    firstPayments: chosen.map((payment) => ({ businessId: payment.businessId, currency: payment.currency, amountCents: payment.amountCents, gstCents: gstOf.get(payment.id) ?? null })),
  };
}
