import { describe, expect, it, vi } from "vitest";
import type { SignupAttribution } from "@brandbasket/db";
import { reportFirstPayment, type PaymentFacts, type ReportDeps } from "./report";

const PAYMENT: PaymentFacts = {
  paymentId: "p-1",
  providerPaymentId: "pay_Abc123",
  kind: "initial",
  captured: 1,
  attentionReason: null,
  amountCents: 299900,
  currency: "INR",
  gstCents: 45746,
  paidAt: new Date("2026-11-01T10:00:00Z"),
  email: "rahul@mehta.in",
  phone: "+919876543210",
};
const ATTRIBUTION: SignupAttribution = {
  businessId: "b-1", utmSource: "meta", utmMedium: "paid_social", utmCampaign: "diwali", utmTerm: null, utmContent: "ad1", gclid: null, fbclid: "IwAR0",
  fbp: "fb.1.1.2", fbc: "fb.1.1.IwAR0", gaClientId: "123.456", gaSessionId: "1700000001", landingPath: "/start", referrerHost: null,
  consentMeasurement: true, consentAdvertising: true, capturedAt: new Date("2026-11-01T09:00:00Z"),
};

function deps(over: Partial<ReportDeps> = {}, payment: PaymentFacts | null = PAYMENT, attribution: SignupAttribution | null = ATTRIBUTION): ReportDeps & { marks: Array<[string, string, string?]> } {
  const marks: Array<[string, string, string?]> = [];
  return {
    load: vi.fn(async () => (payment === null ? null : { payment, attribution })),
    claim: vi.fn(async () => true),
    mark: vi.fn(async (_id, destination, outcome) => {
      marks.push([destination, outcome.status, outcome.reason]);
    }),
    sendGa4: vi.fn(async () => undefined),
    sendMeta: vi.fn(async () => undefined),
    configured: { ga4: true, meta: true },
    siteUrl: "https://app.brandbasket.in/",
    sleep: async () => undefined,
    now: () => new Date("2026-11-01T10:05:00Z"),
    marks,
    ...over,
  };
}

describe("reportFirstPayment", () => {
  it("sends a first payment to GA4 and Meta and marks both sent", async () => {
    const d = deps();
    await reportFirstPayment("p-1", d);
    expect(d.sendGa4).toHaveBeenCalledOnce();
    expect(d.sendMeta).toHaveBeenCalledOnce();
    expect(d.marks).toEqual([["ga4", "sent", undefined], ["meta", "sent", undefined]]);
    const ga4 = vi.mocked(d.sendGa4).mock.calls[0]?.[0];
    expect(ga4?.events[0]?.params).toMatchObject({ transaction_id: "pay_Abc123", value: 2541.54, source: "meta" });
  });

  it("sends nothing, and writes nothing, for a payment that is not a customer's first applied one", async () => {
    for (const payment of [{ ...PAYMENT, kind: "renewal" }, { ...PAYMENT, captured: 2 }, { ...PAYMENT, attentionReason: "amount_mismatch" }]) {
      const d = deps({}, payment);
      await reportFirstPayment("p-1", d);
      expect(d.claim).not.toHaveBeenCalled();
      expect(d.sendGa4).not.toHaveBeenCalled();
      expect(d.sendMeta).not.toHaveBeenCalled();
    }
    const missing = deps({}, null);
    await reportFirstPayment("p-1", missing);
    expect(missing.claim).not.toHaveBeenCalled();
  });

  it("records a customer who did not come from an ad as skipped, and sends nothing", async () => {
    const d = deps({}, PAYMENT, null);
    await reportFirstPayment("p-1", d);
    expect(d.marks).toEqual([["ga4", "skipped", "no_attribution"], ["meta", "skipped", "no_attribution"]]);
    expect(d.sendGa4).not.toHaveBeenCalled();
  });

  it("holds each destination to the consent given, and to having what it needs", async () => {
    const d = deps({}, PAYMENT, { ...ATTRIBUTION, consentMeasurement: false, consentAdvertising: false });
    await reportFirstPayment("p-1", d);
    expect(d.marks).toEqual([["ga4", "skipped", "no_consent"], ["meta", "skipped", "no_consent"]]);
    const noIds = deps({}, PAYMENT, { ...ATTRIBUTION, gaClientId: null });
    await reportFirstPayment("p-1", noIds);
    expect(noIds.marks[0]).toEqual(["ga4", "skipped", "no_ids"]);
    expect(noIds.sendMeta).toHaveBeenCalledOnce();
  });

  it("leaves a destination that is not set up alone: no row, no call", async () => {
    const d = deps({ configured: { ga4: false, meta: true } });
    await reportFirstPayment("p-1", d);
    expect(d.claim).toHaveBeenCalledTimes(1);
    expect(d.sendGa4).not.toHaveBeenCalled();
    expect(d.sendMeta).toHaveBeenCalledOnce();
  });

  it("does not send what another delivery of the same payment already claimed", async () => {
    const d = deps({ claim: vi.fn(async () => false) });
    await reportFirstPayment("p-1", d);
    expect(d.sendGa4).not.toHaveBeenCalled();
    expect(d.sendMeta).not.toHaveBeenCalled();
    expect(d.mark).not.toHaveBeenCalled();
  });

  it("tries a failing send three times, marks it failed, still sends the other, and never throws", async () => {
    const sendGa4 = vi.fn(async () => {
      throw new Error("GA4 answered 500");
    });
    const d = deps({ sendGa4 });
    await expect(reportFirstPayment("p-1", d)).resolves.toBeUndefined();
    expect(sendGa4).toHaveBeenCalledTimes(3);
    expect(d.marks).toEqual([["ga4", "failed", "GA4 answered 500"], ["meta", "sent", undefined]]);
  });

  it("marks a send sent when a retry gets through", async () => {
    const sendMeta = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(undefined);
    const d = deps({ sendMeta });
    await reportFirstPayment("p-1", d);
    expect(sendMeta).toHaveBeenCalledTimes(2);
    expect(d.marks[1]).toEqual(["meta", "sent", undefined]);
  });
});
