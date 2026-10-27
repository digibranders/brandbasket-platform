import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { billingCurrency, type BillingCurrency, type PaymentMethodDetails } from "@brandbasket/db";

/**
 * True when `signature` is the HMAC-SHA256 of the exact raw `body` string, keyed with `webhookSecret`. The caller
 * must pass the untouched request body: re-serialising parsed JSON can reorder keys or change whitespace and
 * silently break this check, which is why `parseRazorpayWebhookEvent` takes the same raw string separately rather
 * than being handed an already-parsed object.
 */
export function verifyRazorpayWebhookSignature(body: string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac("sha256", webhookSecret).update(body, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

function isCurrency(value: string): value is BillingCurrency {
  return (billingCurrency.enumValues as readonly string[]).includes(value);
}

const eventNameSchema = z.object({ event: z.string().min(1) });

const chargedSchema = z.object({
  event: z.literal("subscription.charged"),
  payload: z.object({
    subscription: z.object({
      entity: z.object({
        id: z.string().min(1),
        // The first instant of the cycle this charge paid for, printed on its tax invoice. Lenient on purpose: only the
        // invoice reads it, and a charge must never go unrecorded over it. Missing, null or odd means null.
        current_start: z.number().int().positive().nullish().catch(null),
        current_end: z.number().int().positive(),
      }),
    }),
    payment: z.object({
      // Loose, so the method and card fields reach readPaymentMethod, which reads them on its own lenient terms.
      entity: z.looseObject({
        id: z.string().min(1),
        amount: z.number().int().nonnegative(),
        currency: z.string(),
        status: z.string().min(1),
        created_at: z.number().int().positive(),
      }),
    }),
  }),
});

/** A short piece of text Razorpay sent, or null when it is missing, empty, too long or not text at all. */
const lenientText = z.string().trim().min(1).max(80).nullable().catch(null);

/**
 * How the payment was made. Read separately from, and far more leniently than, the charge itself: a card we cannot
 * read must never stop money that was taken from being recorded, so every field falls back to null on its own.
 */
const paymentMethodSchema = z.object({
  method: z.string().trim().min(1).max(40),
  vpa: lenientText,
  card: z
    .object({
      network: lenientText,
      last4: z.string().regex(/^[0-9]{4}$/).nullable().catch(null),
      type: lenientText,
      issuer: lenientText,
    })
    .nullable()
    .catch(null),
});

function readPaymentMethod(paymentEntity: unknown): PaymentMethodDetails | null {
  const parsed = paymentMethodSchema.safeParse(paymentEntity);
  if (!parsed.success) return null;
  const { method, vpa, card } = parsed.data;
  return {
    method,
    cardNetwork: card?.network ?? null,
    cardLast4: card?.last4 ?? null,
    cardType: card?.type ?? null,
    cardIssuer: card?.issuer ?? null,
    upiVpa: method === "upi" ? vpa : null,
  };
}

/** A one-time payment for a charge: Razorpay's `order.paid`, with the order and the payment that paid it. */
const orderPaidSchema = z.object({
  event: z.literal("order.paid"),
  payload: z.object({
    order: z.object({ entity: z.object({ id: z.string().min(1) }) }),
    payment: z.object({
      entity: z.looseObject({
        id: z.string().min(1),
        amount: z.number().int().nonnegative(),
        currency: z.string(),
        status: z.string().min(1),
        created_at: z.number().int().positive(),
      }),
    }),
  }),
});

/** A reason Razorpay gave for a failure, or null when missing or not text. Only the alert and the console read it. */
const failureText = z.string().trim().min(1).max(300).nullish().catch(null);

/**
 * A payment attempt that took nothing. Lenient on everything but the money: a failure must never go unrecorded over how
 * Razorpay worded it. Razorpay sends empty notes as `[]`, which reads as no notes.
 */
const paymentFailedSchema = z.object({
  event: z.literal("payment.failed"),
  payload: z.object({
    payment: z.object({
      entity: z.looseObject({
        id: z.string().min(1),
        amount: z.number().int().nonnegative(),
        currency: z.string(),
        status: z.string().min(1),
        created_at: z.number().int().positive(),
        order_id: z.string().min(1).nullish().catch(null),
        error_code: failureText,
        error_description: failureText,
        error_reason: failureText,
        notes: z.looseObject({ businessId: z.string().min(1).nullish().catch(null) }).nullish().catch(null),
      }),
    }),
  }),
});

/**
 * Lifecycle events with no payment attached. Each only says the status changed: the handler asks Razorpay for the
 * current status before storing anything, since Razorpay does not deliver in order. Paused and resumed come from the
 * Razorpay dashboard (this app never pauses), so a subscription paused there still stops access here.
 */
const STATUS_EVENTS = [
  "subscription.authenticated",
  "subscription.activated",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.paused",
  "subscription.resumed",
] as const;

const statusSchema = z.object({
  event: z.enum(STATUS_EVENTS),
  payload: z.object({
    subscription: z.object({
      entity: z.object({
        id: z.string().min(1),
        status: z.string().min(1),
      }),
    }),
  }),
});

export type RazorpayWebhookEvent =
  /** A charge (the first payment or a renewal) against a subscription. */
  | {
      readonly kind: "charged";
      readonly subscriptionId: string;
      /** The start of the billing period this charge paid for, as Razorpay computed it, or null when it did not say. */
      readonly currentStart: Date | null;
      /** The end of the billing period this charge paid for, as Razorpay itself computed it. */
      readonly currentEnd: Date;
      /** The moment Razorpay actually captured the charge, as opposed to `currentEnd` which is when the period it
       * paid for ends. */
      readonly paidAt: Date;
      readonly paymentId: string;
      readonly amountCents: number;
      readonly currency: BillingCurrency;
      /** How the customer paid, or null when Razorpay did not say in a form we could read. */
      readonly method: PaymentMethodDetails | null;
    }
  /** A one-time payment for a charge (a paid extra), matched to the charge by the Razorpay order id. */
  | {
      readonly kind: "order-paid";
      readonly orderId: string;
      readonly paymentId: string;
      readonly amountCents: number;
      readonly currency: BillingCurrency;
      readonly paidAt: Date;
      readonly method: PaymentMethodDetails | null;
    }
  /**
   * A payment attempt that failed: nothing was taken. Matched to a business by the charge's order id, or by the business
   * id the payment's notes carry; either may be missing.
   */
  | {
      readonly kind: "payment-failed";
      readonly paymentId: string;
      readonly amountCents: number;
      readonly currency: BillingCurrency;
      readonly failedAt: Date;
      readonly orderId: string | null;
      readonly businessId: string | null;
      readonly failureReason: string;
    }
  /** A lifecycle change with no payment attached: mirror `providerStatus` onto the subscription, nothing else. */
  | { readonly kind: "status"; readonly subscriptionId: string; readonly providerStatus: string }
  /** An event name this app does not act on (e.g. payment.captured): expected and benign, no logging needed. */
  | { readonly kind: "unhandled" }
  /**
   * Malformed JSON, or an event we DO act on (subscription.charged / a status event) whose payload didn't match
   * what we expect, or a charged event reporting a currency outside what this app bills in. `reason` is safe to
   * log (never includes the raw body). The caller should log this loudly: it likely means a real payment or
   * status change did not get recorded.
   */
  | { readonly kind: "invalid"; readonly reason: string };

/**
 * Reads the webhook event this app acts on out of a raw, already-signature-verified body. Distinguishes three very
 * different "nothing to do" outcomes: `unhandled` (a real event name this app just doesn't subscribe to: expected
 * and benign), `invalid` (malformed JSON, or an event we DO act on whose payload didn't match what we expect;
 * since the signature already proved this came from Razorpay, this likely means a real payment or status change is
 * about to go unrecorded and should be logged loudly), and the two happy-path kinds. Never throws: the caller
 * should acknowledge the webhook and move on rather than 500 (Razorpay retries a non-2xx response, which would just
 * repeat the same event).
 */
export function parseRazorpayWebhookEvent(body: string): RazorpayWebhookEvent {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { kind: "invalid", reason: "malformed JSON" };
  }

  const eventName = eventNameSchema.safeParse(json);
  if (!eventName.success) {
    return { kind: "invalid", reason: "no event name" };
  }

  if (eventName.data.event === "subscription.charged") {
    const charged = chargedSchema.safeParse(json);
    if (!charged.success) {
      return { kind: "invalid", reason: "subscription.charged payload did not match the expected shape" };
    }
    const { subscription, payment } = charged.data.payload;
    if (payment.entity.status !== "captured") {
      return { kind: "invalid", reason: `unexpected payment status: ${payment.entity.status}` };
    }
    if (!isCurrency(payment.entity.currency)) {
      return { kind: "invalid", reason: `unsupported currency: ${payment.entity.currency}` };
    }
    return {
      kind: "charged",
      subscriptionId: subscription.entity.id,
      currentStart: typeof subscription.entity.current_start === "number" ? new Date(subscription.entity.current_start * 1000) : null,
      currentEnd: new Date(subscription.entity.current_end * 1000),
      paidAt: new Date(payment.entity.created_at * 1000),
      paymentId: payment.entity.id,
      amountCents: payment.entity.amount,
      currency: payment.entity.currency,
      method: readPaymentMethod(payment.entity),
    };
  }

  if (eventName.data.event === "order.paid") {
    const paid = orderPaidSchema.safeParse(json);
    if (!paid.success) return { kind: "invalid", reason: "order.paid payload did not match the expected shape" };
    const payment = paid.data.payload.payment.entity;
    if (payment.status !== "captured") return { kind: "invalid", reason: `unexpected payment status: ${payment.status}` };
    if (!isCurrency(payment.currency)) return { kind: "invalid", reason: `unsupported currency: ${payment.currency}` };
    return {
      kind: "order-paid",
      orderId: paid.data.payload.order.entity.id,
      paymentId: payment.id,
      amountCents: payment.amount,
      currency: payment.currency,
      paidAt: new Date(payment.created_at * 1000),
      method: readPaymentMethod(payment),
    };
  }

  if (eventName.data.event === "payment.failed") {
    const failed = paymentFailedSchema.safeParse(json);
    if (!failed.success) return { kind: "invalid", reason: "payment.failed payload did not match the expected shape" };
    const payment = failed.data.payload.payment.entity;
    if (payment.status !== "failed") return { kind: "invalid", reason: `unexpected payment status: ${payment.status}` };
    if (!isCurrency(payment.currency)) return { kind: "invalid", reason: `unsupported currency: ${payment.currency}` };
    return {
      kind: "payment-failed",
      paymentId: payment.id,
      amountCents: payment.amount,
      currency: payment.currency,
      failedAt: new Date(payment.created_at * 1000),
      orderId: payment.order_id ?? null,
      businessId: payment.notes?.businessId ?? null,
      failureReason: payment.error_description ?? payment.error_reason ?? payment.error_code ?? "Razorpay did not say why",
    };
  }

  if ((STATUS_EVENTS as readonly string[]).includes(eventName.data.event)) {
    const status = statusSchema.safeParse(json);
    if (!status.success) {
      return { kind: "invalid", reason: `${eventName.data.event} payload did not match the expected shape` };
    }
    return { kind: "status", subscriptionId: status.data.payload.subscription.entity.id, providerStatus: status.data.payload.subscription.entity.status };
  }

  return { kind: "unhandled" };
}
