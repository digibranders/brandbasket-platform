import "server-only";
import {
  claimConversionEvent,
  findPaymentAlertBase,
  findTaxInvoiceByPaymentId,
  getSignupAttribution,
  listRetryableConversionPayments,
  markConversionEvent,
} from "@brandbasket/db";
import type { NewSignupAttribution } from "@brandbasket/db";
import { conversionConfig, type ConversionConfig } from "@/lib/conversions/config";
import { buildGa4SignUp } from "@/lib/conversions/ga4";
import { reportFirstPayment, type ReportDeps } from "@/lib/conversions/report";
import { sendGa4, sendMeta } from "@/lib/conversions/senders";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";

function liveDeps(config: ConversionConfig): ReportDeps {
  const db = getStaffDb();
  return {
    async load(paymentId) {
      const base = await findPaymentAlertBase(db, paymentId);
      if (base === null) return null;
      const { payment } = base;
      const [invoice, attribution] = await Promise.all([findTaxInvoiceByPaymentId(db, paymentId), getSignupAttribution(db, payment.businessId)]);
      return {
        payment: {
          paymentId,
          providerPaymentId: payment.providerPaymentId,
          kind: payment.kind,
          captured: base.captured,
          attentionReason: payment.attentionReason,
          amountCents: payment.amountCents,
          currency: payment.currency,
          gstCents: invoice === null ? null : invoice.cgstCents + invoice.sgstCents + invoice.igstCents,
          paidAt: payment.paidAt ?? payment.createdAt,
          email: base.owner.email,
          phone: base.owner.phone,
        },
        attribution,
      };
    },
    claim: (paymentId, destination) => claimConversionEvent(db, paymentId, destination),
    mark: (paymentId, destination, outcome) => markConversionEvent(db, paymentId, destination, outcome),
    sendGa4: async (body) => {
      if (config.ga4 === null) throw new Error("GA4 is not set up");
      await sendGa4(config.ga4, body);
    },
    sendMeta: async (body) => {
      if (config.meta === null) throw new Error("Meta is not set up");
      await sendMeta(config.meta, body);
    },
    configured: { ga4: config.ga4 !== null, meta: config.meta !== null },
    siteUrl: `${serverEnv().APP_ORIGIN}/`,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
  };
}

/**
 * Tells GA4 and Meta about a payment that has just been recorded, if it is a customer's first and they came from an ad
 * (plan 59). Call it after the payment's transaction has committed, beside announcePaymentToTeams. Does nothing while neither
 * destination is set up. Best-effort: it never throws.
 */
export async function reportFirstPaymentToAds(paymentId: string): Promise<void> {
  try {
    const config = conversionConfig();
    if (config.ga4 === null && config.meta === null) return;
    await reportFirstPayment(paymentId, liveDeps(config));
  } catch (error) {
    console.error("[conversions] A payment could not be reported.", { paymentId, error: error instanceof Error ? error.name : "error" });
  }
}

/** The nightly job's step: reports again each payment whose send failed, for up to a week and five tries. */
export async function retryFailedConversions(now: Date): Promise<{ readonly retried: number }> {
  const config = conversionConfig();
  if (config.ga4 === null && config.meta === null) return { retried: 0 };
  const paymentIds = await listRetryableConversionPayments(getStaffDb(), now);
  for (const paymentId of paymentIds) await reportFirstPaymentToAds(paymentId);
  return { retried: paymentIds.length };
}

/**
 * Tells GA4 that an account was opened by someone who came from an ad (plan 59), on their own GA4 client and session, so the
 * funnel report has a sign-up step between the lead and the purchase. Only for a visitor who allowed measurement and whose
 * client id was read. Sent once, when the account is created. Best-effort: it never throws.
 */
export async function reportSignUpToAds(attribution: NewSignupAttribution): Promise<void> {
  try {
    const { ga4 } = conversionConfig();
    if (ga4 === null || attribution.consentMeasurement !== true || !attribution.gaClientId) return;
    await sendGa4(
      ga4,
      buildGa4SignUp({
        clientId: attribution.gaClientId,
        sessionId: attribution.gaSessionId ?? null,
        campaign: { utm_source: attribution.utmSource, utm_medium: attribution.utmMedium, utm_campaign: attribution.utmCampaign, utm_term: attribution.utmTerm, utm_content: attribution.utmContent },
      }),
    );
  } catch (error) {
    console.error("[conversions] A sign-up could not be reported.", error instanceof Error ? error.message : "error");
  }
}
