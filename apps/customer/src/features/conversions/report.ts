import type { SignupAttribution } from "@brandbasket/db";
import { buildGa4Purchase, type Ga4Body } from "./ga4";
import { buildMetaPurchase, type MetaBody } from "./meta";
import { conversionValueCents } from "./value";

/** What the reporter needs to know about a payment. */
export interface PaymentFacts {
  readonly paymentId: string;
  readonly providerPaymentId: string;
  readonly kind: string;
  /** Which captured payment of the business this is: 1 is the customer's first. */
  readonly captured: number;
  readonly attentionReason: string | null;
  readonly amountCents: number;
  readonly currency: "INR" | "USD";
  /** GST on the tax invoice, or null when none was issued. */
  readonly gstCents: number | null;
  readonly paidAt: Date;
  readonly email: string | null;
  readonly phone: string | null;
}

export type Destination = "ga4" | "meta";
export type ConversionOutcome = { readonly status: "sent" } | { readonly status: "skipped" | "failed"; readonly reason: string };

export interface ReportDeps {
  load(paymentId: string): Promise<{ readonly payment: PaymentFacts; readonly attribution: SignupAttribution | null } | null>;
  /** True when this call took the (payment, destination) pair: false when another delivery already has it or it was sent. */
  claim(paymentId: string, destination: Destination): Promise<boolean>;
  mark(paymentId: string, destination: Destination, outcome: ConversionOutcome): Promise<void>;
  /** Both send functions throw on any answer that is not a success. */
  sendGa4(body: Ga4Body): Promise<void>;
  sendMeta(body: MetaBody): Promise<void>;
  /** Which destinations have their keys set. One that does not is left alone: no row, no call. */
  readonly configured: Readonly<Record<Destination, boolean>>;
  /** Where Meta is told the sale happened. */
  readonly siteUrl: string;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
}

const ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 3_000] as const;
const REASON_MAX = 200;

async function sendWithRetries(send: () => Promise<void>, sleep: ReportDeps["sleep"]): Promise<ConversionOutcome> {
  let last = "error";
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      await send();
      return { status: "sent" };
    } catch (error) {
      last = error instanceof Error ? error.message.slice(0, REASON_MAX) : "error";
      const wait = BACKOFF_MS[attempt];
      if (wait !== undefined) await sleep(wait);
    }
  }
  return { status: "failed", reason: last };
}

/**
 * Tells the ad platforms about a customer's first payment (plan 59), once, from the server: GA4 (Measurement Protocol) and
 * Meta (Conversions API). It sends only what the visitor agreed to when their ids were read, and only for a customer who came
 * from an ad. One row per (payment, destination) in conversion_events makes a repeated call, or the webhook and the
 * browser confirmation both reporting the same payment, send once. Never throws: a payment must not wait on an ad platform.
 */
export async function reportFirstPayment(paymentId: string, deps: ReportDeps): Promise<void> {
  const loaded = await deps.load(paymentId);
  if (loaded === null) return;
  const { payment, attribution } = loaded;
  if (payment.kind !== "initial" || payment.captured !== 1 || payment.attentionReason !== null) return;

  const valueCents = conversionValueCents({ amountCents: payment.amountCents, currency: payment.currency, gstCents: payment.gstCents });
  const destinations: Destination[] = ["ga4", "meta"];
  for (const destination of destinations) {
    if (!deps.configured[destination]) continue;
    if (!(await deps.claim(paymentId, destination))) continue;
    const outcome = await outcomeFor(destination, payment, attribution, valueCents, deps);
    await deps.mark(paymentId, destination, outcome);
  }
}

async function outcomeFor(destination: Destination, payment: PaymentFacts, attribution: SignupAttribution | null, valueCents: number, deps: ReportDeps): Promise<ConversionOutcome> {
  if (attribution === null) return { status: "skipped", reason: "no_attribution" };
  if (destination === "ga4") {
    if (!attribution.consentMeasurement) return { status: "skipped", reason: "no_consent" };
    if (attribution.gaClientId === null) return { status: "skipped", reason: "no_ids" };
    const body = buildGa4Purchase({
      clientId: attribution.gaClientId,
      sessionId: attribution.gaSessionId,
      transactionId: payment.providerPaymentId,
      valueCents,
      currency: payment.currency,
      paidAt: payment.paidAt,
      now: deps.now(),
      campaign: { utm_source: attribution.utmSource, utm_medium: attribution.utmMedium, utm_campaign: attribution.utmCampaign, utm_term: attribution.utmTerm, utm_content: attribution.utmContent },
    });
    return sendWithRetries(() => deps.sendGa4(body), deps.sleep);
  }
  if (!attribution.consentAdvertising) return { status: "skipped", reason: "no_consent" };
  const body = buildMetaPurchase({
    eventId: payment.providerPaymentId,
    paidAt: payment.paidAt,
    sourceUrl: deps.siteUrl,
    email: payment.email,
    phone: payment.phone,
    fbp: attribution.fbp,
    fbc: attribution.fbc,
    valueCents,
    currency: payment.currency,
  });
  return sendWithRetries(() => deps.sendMeta(body), deps.sleep);
}
