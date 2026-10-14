import type { ClientBilling, ClientFirstPayment, ClientSubscription } from "@firstfold/db";
import { describe, expect, it } from "vitest";
import { clientPaymentState, countPayingClients } from "./client-payment";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const PAID_AT = new Date("2026-09-01T12:00:00.000Z");
const LATER = new Date("2026-12-01T12:00:00.000Z");
const EARLIER = new Date("2026-09-10T12:00:00.000Z");

function subscription(status: ClientSubscription["status"], paidThroughAt: Date | null): ClientSubscription {
  return {
    status,
    provider: "fake",
    activatedAt: paidThroughAt === null ? null : PAID_AT,
    paidThroughAt,
    commitmentEndsAt: paidThroughAt,
  };
}

const FIRST: ClientFirstPayment = {
  amountCents: 22500,
  currency: "USD",
  provider: "fake",
  paidAt: PAID_AT,
  manual: null,
};

describe("clientPaymentState", () => {
  it("is not paid with no subscription", () => {
    expect(clientPaymentState({ subscription: null, firstPayment: null }, NOW)).toEqual({ kind: "not-paid" });
  });

  it("shows an open checkout that was never paid", () => {
    expect(clientPaymentState({ subscription: subscription("incomplete", null), firstPayment: null }, NOW)).toEqual({
      kind: "checkout-open",
    });
  });

  it("is not paid when the newest subscription is a replaced checkout", () => {
    expect(clientPaymentState({ subscription: subscription("cancelled", null), firstPayment: null }, NOW)).toEqual({
      kind: "not-paid",
    });
  });

  it("shows the first payment and the paid-through date while paid", () => {
    const billing: ClientBilling = { subscription: subscription("active", LATER), firstPayment: FIRST };
    expect(clientPaymentState(billing, NOW)).toEqual({
      kind: "paid",
      firstAmount: "$225",
      firstPaidAt: PAID_AT,
      paidThroughAt: LATER,
      manual: null,
    });
  });

  it("carries who recorded a payment by hand, its reference and date, in its own currency", () => {
    const manual = { recordedBy: { id: "staff-1", name: "Sam Staff" }, reference: "UTR-1", receivedOn: "2026-08-31" };
    const billing: ClientBilling = {
      subscription: { ...subscription("active", LATER), provider: "manual" },
      firstPayment: { ...FIRST, amountCents: 350000, currency: "INR", provider: "manual", manual },
    };
    expect(clientPaymentState(billing, NOW)).toMatchObject({ kind: "paid", firstAmount: "₹3,500", manual });
  });

  it("is still paid while a cancelled subscription's period runs", () => {
    const billing: ClientBilling = { subscription: subscription("cancelled", LATER), firstPayment: FIRST };
    expect(clientPaymentState(billing, NOW)).toMatchObject({ kind: "paid", paidThroughAt: LATER });
  });

  it.each([
    ["the period has ended", subscription("active", EARLIER)],
    ["the provider gave up", subscription("inactive", LATER)],
    ["it was cancelled and its period has ended", subscription("cancelled", EARLIER)],
  ])("is lapsed when %s", (_label, sub) => {
    expect(clientPaymentState({ subscription: sub, firstPayment: FIRST }, NOW)).toMatchObject({ kind: "lapsed" });
  });

  it("is lapsed, not unpaid, when a payment exists but no activated subscription is newest", () => {
    expect(clientPaymentState({ subscription: null, firstPayment: FIRST }, NOW)).toEqual({
      kind: "lapsed",
      firstAmount: "$225",
      firstPaidAt: PAID_AT,
      paidThroughAt: null,
      manual: null,
    });
  });
});

describe("countPayingClients", () => {
  it("counts businesses inside a paid period, cancelled subscriptions included", () => {
    const clients = [
      { billing: { subscription: subscription("active", LATER), firstPayment: FIRST } },
      { billing: { subscription: subscription("past_due", LATER), firstPayment: FIRST } },
      { billing: { subscription: subscription("cancelled", LATER), firstPayment: FIRST } },
      { billing: { subscription: subscription("cancelled", EARLIER), firstPayment: FIRST } },
      { billing: { subscription: subscription("active", EARLIER), firstPayment: FIRST } },
      { billing: { subscription: subscription("incomplete", null), firstPayment: null } },
      { billing: { subscription: null, firstPayment: null } },
    ];
    expect(countPayingClients(clients, NOW)).toBe(3);
  });
});
