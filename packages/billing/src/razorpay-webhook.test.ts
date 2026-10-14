import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseRazorpayWebhookEvent, verifyRazorpayWebhookSignature } from "./razorpay-webhook";

const SECRET = "a-test-webhook-secret-at-least-this-long";

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyRazorpayWebhookSignature", () => {
  it("accepts a body signed with the right secret", () => {
    const body = '{"event":"subscription.charged"}';
    expect(verifyRazorpayWebhookSignature(body, sign(body, SECRET), SECRET)).toBe(true);
  });

  it("rejects a body whose signature does not match", () => {
    const body = '{"event":"subscription.charged"}';
    expect(verifyRazorpayWebhookSignature(body, sign(body, "a-different-secret-of-the-same-length"), SECRET)).toBe(
      false,
    );
  });

  it("rejects a tampered body even with the original signature", () => {
    const original = '{"event":"subscription.charged"}';
    const signature = sign(original, SECRET);
    const tampered = '{"event":"subscription.cancelled"}';
    expect(verifyRazorpayWebhookSignature(tampered, signature, SECRET)).toBe(false);
  });

  it("rejects a malformed (non-hex, or wrong-length) signature without throwing", () => {
    const body = '{"event":"subscription.charged"}';
    expect(verifyRazorpayWebhookSignature(body, "not-hex", SECRET)).toBe(false);
    expect(verifyRazorpayWebhookSignature(body, "", SECRET)).toBe(false);
  });
});

describe("parseRazorpayWebhookEvent", () => {
  it("parses a subscription.charged event with its payment and subscription entities", () => {
    const body = JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_abc", status: "active", current_start: 1_700_000_000, current_end: 1_702_678_400 } },
        payment: { entity: { id: "pay_abc", amount: 7_500, currency: "USD", status: "captured", created_at: 1_700_000_500 } },
      },
    });
    const parsed = parseRazorpayWebhookEvent(body);
    expect(parsed).toEqual({
      kind: "charged",
      subscriptionId: "sub_abc",
      currentStart: new Date(1_700_000_000 * 1000),
      currentEnd: new Date(1_702_678_400 * 1000),
      paidAt: new Date(1_700_000_500 * 1000),
      paymentId: "pay_abc",
      amountCents: 7_500,
      currency: "USD",
      method: null,
    });
  });

  it("reads the start of the cycle a charge paid for, and records the charge without it when Razorpay sends none", () => {
    const charged = (subscription: Record<string, unknown>): string =>
      JSON.stringify({
        event: "subscription.charged",
        payload: {
          subscription: { entity: { id: "sub_abc", current_end: 1_702_678_400, ...subscription } },
          payment: { entity: { id: "pay_abc", amount: 7_500, currency: "USD", status: "captured", created_at: 1_700_000_500 } },
        },
      });
    expect(parseRazorpayWebhookEvent(charged({ current_start: 1_700_000_000 }))).toMatchObject({ kind: "charged", currentStart: new Date(1_700_000_000 * 1000) });
    expect(parseRazorpayWebhookEvent(charged({}))).toMatchObject({ kind: "charged", currentStart: null });
    expect(parseRazorpayWebhookEvent(charged({ current_start: null }))).toMatchObject({ kind: "charged", currentStart: null });
    expect(parseRazorpayWebhookEvent(charged({ current_start: "soon" }))).toMatchObject({ kind: "charged", currentStart: null, paymentId: "pay_abc" });
  });

  function chargedWith(paymentFields: Record<string, unknown>): string {
    return JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_abc", current_end: 1_702_678_400 } },
        payment: {
          entity: {
            id: "pay_abc",
            amount: 7_500,
            currency: "USD",
            status: "captured",
            created_at: 1_700_000_500,
            ...paymentFields,
          },
        },
      },
    });
  }

  it("reads the card Razorpay charged from the payment entity", () => {
    const parsed = parseRazorpayWebhookEvent(
      chargedWith({
        method: "card",
        card_id: "card_abc",
        card: { id: "card_abc", entity: "card", name: "Ana", last4: "1234", network: "Visa", type: "debit", issuer: "HDFC", international: false },
      }),
    );
    expect(parsed).toMatchObject({
      kind: "charged",
      method: { method: "card", cardNetwork: "Visa", cardLast4: "1234", cardType: "debit", cardIssuer: "HDFC", upiVpa: null },
    });
  });

  it("reads the UPI address a payment came from", () => {
    const parsed = parseRazorpayWebhookEvent(chargedWith({ method: "upi", vpa: "ana@okhdfc", card: null }));
    expect(parsed).toMatchObject({
      kind: "charged",
      method: { method: "upi", cardNetwork: null, cardLast4: null, cardType: null, cardIssuer: null, upiVpa: "ana@okhdfc" },
    });
  });

  it("keeps the method but drops card details it cannot trust, and still records the charge", () => {
    const parsed = parseRazorpayWebhookEvent(
      chargedWith({ method: "card", card: { last4: "12ab", network: 7, type: "debit", issuer: null } }),
    );
    expect(parsed).toMatchObject({
      kind: "charged",
      paymentId: "pay_abc",
      method: { method: "card", cardNetwork: null, cardLast4: null, cardType: "debit", cardIssuer: null, upiVpa: null },
    });
  });

  it("records the charge with no method when Razorpay sends none, or sends nonsense", () => {
    expect(parseRazorpayWebhookEvent(chargedWith({}))).toMatchObject({ kind: "charged", method: null });
    expect(parseRazorpayWebhookEvent(chargedWith({ method: 42 }))).toMatchObject({ kind: "charged", method: null });
  });

  it("parses an order.paid event for a charge, with how it was paid", () => {
    const body = JSON.stringify({
      event: "order.paid",
      payload: {
        order: { entity: { id: "order_abc", amount: 336_300, amount_paid: 336_300, status: "paid" } },
        payment: {
          entity: { id: "pay_abc", amount: 336_300, currency: "INR", status: "captured", created_at: 1_790_000_000, method: "upi", vpa: "asha@okhdfc" },
        },
      },
    });
    expect(parseRazorpayWebhookEvent(body)).toEqual({
      kind: "order-paid",
      orderId: "order_abc",
      paymentId: "pay_abc",
      amountCents: 336_300,
      currency: "INR",
      paidAt: new Date(1_790_000_000 * 1000),
      method: { method: "upi", cardNetwork: null, cardLast4: null, cardType: null, cardIssuer: null, upiVpa: "asha@okhdfc" },
    });
  });

  it("refuses an order.paid event with the wrong shape, an uncaptured payment or an unknown currency", () => {
    const base = { id: "pay_abc", amount: 100, currency: "INR", status: "captured", created_at: 1_790_000_000 };
    const body = (payment: Record<string, unknown>, order: unknown = { entity: { id: "order_abc" } }) =>
      JSON.stringify({ event: "order.paid", payload: { order, payment: { entity: payment } } });
    expect(parseRazorpayWebhookEvent(body(base, {}))).toMatchObject({ kind: "invalid" });
    expect(parseRazorpayWebhookEvent(body({ ...base, status: "authorized" }))).toEqual({
      kind: "invalid",
      reason: "unexpected payment status: authorized",
    });
    expect(parseRazorpayWebhookEvent(body({ ...base, currency: "EUR" }))).toEqual({ kind: "invalid", reason: "unsupported currency: EUR" });
  });

  it("parses a subscription.halted event with no payment entity", () => {
    const body = JSON.stringify({
      event: "subscription.halted",
      payload: { subscription: { entity: { id: "sub_abc", status: "halted" } } },
    });
    expect(parseRazorpayWebhookEvent(body)).toEqual({ kind: "status", subscriptionId: "sub_abc", providerStatus: "halted" });
  });

  it.each([
    "subscription.activated",
    "subscription.authenticated",
    "subscription.pending",
    "subscription.cancelled",
    "subscription.completed",
    "subscription.paused",
    "subscription.resumed",
  ])(
    "parses %s as a status event",
    (event) => {
      const body = JSON.stringify({ event, payload: { subscription: { entity: { id: "sub_abc", status: "whatever" } } } });
      const parsed = parseRazorpayWebhookEvent(body);
      expect(parsed?.kind).toBe("status");
    },
  );

  it("returns kind unhandled for an event this app does not act on", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    expect(parseRazorpayWebhookEvent(body)).toEqual({ kind: "unhandled" });
  });

  it("returns kind invalid for malformed JSON rather than throwing", () => {
    expect(parseRazorpayWebhookEvent("not json")).toEqual({ kind: "invalid", reason: "malformed JSON" });
  });

  it("returns kind invalid when a subscription.charged payload's required field is the wrong shape", () => {
    const body = JSON.stringify({ event: "subscription.charged", payload: { subscription: { entity: { id: 123 } } } });
    expect(parseRazorpayWebhookEvent(body)).toEqual({
      kind: "invalid",
      reason: "subscription.charged payload did not match the expected shape",
    });
  });

  it("returns kind invalid when a charged event reports a currency this app does not bill in", () => {
    const body = JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_abc", current_end: 1_702_678_400 } },
        payment: { entity: { id: "pay_abc", amount: 7_500, currency: "EUR", status: "captured", created_at: 1_700_000_500 } },
      },
    });
    expect(parseRazorpayWebhookEvent(body)).toEqual({ kind: "invalid", reason: "unsupported currency: EUR" });
  });

  it("returns kind invalid when a charged event's payment status is not captured", () => {
    const body = JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_abc", current_end: 1_702_678_400 } },
        payment: { entity: { id: "pay_abc", amount: 7_500, currency: "USD", status: "failed", created_at: 1_700_000_500 } },
      },
    });
    expect(parseRazorpayWebhookEvent(body)).toEqual({ kind: "invalid", reason: "unexpected payment status: failed" });
  });

  it("returns kind invalid when a subscription.charged payload is missing the payment's created_at", () => {
    const body = JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_abc", current_end: 1_702_678_400 } },
        payment: { entity: { id: "pay_abc", amount: 7_500, currency: "USD", status: "captured" } },
      },
    });
    expect(parseRazorpayWebhookEvent(body)).toEqual({
      kind: "invalid",
      reason: "subscription.charged payload did not match the expected shape",
    });
  });
});
