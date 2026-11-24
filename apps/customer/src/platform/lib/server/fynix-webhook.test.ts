import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  listDueSalesRedemptions: vi.fn(),
  markSalesRedemptionDelivered: vi.fn(),
  markSalesRedemptionFailed: vi.fn(),
}));
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));

import { fynixWebhookConfig, redemptionPayload, signBody } from "./fynix-webhook";

const SECRET = "s".repeat(32);

describe("fynixWebhookConfig", () => {
  it("is off without a url or with a short secret", () => {
    expect(fynixWebhookConfig({ FYNIX_WEBHOOK_URL: "", FYNIX_WEBHOOK_SECRET: SECRET })).toBeNull();
    expect(fynixWebhookConfig({ FYNIX_WEBHOOK_URL: "http://x", FYNIX_WEBHOOK_SECRET: "short" })).toBeNull();
    expect(fynixWebhookConfig({ FYNIX_WEBHOOK_URL: " http://x ", FYNIX_WEBHOOK_SECRET: SECRET })).toEqual({ url: "http://x", secret: SECRET });
  });
});

describe("signBody", () => {
  it("is an HMAC-SHA256 over timestamp.body", () => {
    const expected = createHmac("sha256", SECRET).update("1700000000.{\"a\":1}").digest("hex");
    expect(signBody(SECRET, "1700000000", "{\"a\":1}")).toBe(expected);
  });
  it("changes with the body and the time", () => {
    expect(signBody(SECRET, "1", "a")).not.toBe(signBody(SECRET, "1", "b"));
    expect(signBody(SECRET, "1", "a")).not.toBe(signBody(SECRET, "2", "a"));
  });
});

describe("redemptionPayload", () => {
  it("carries the coupon, client and payment", () => {
    const payload = redemptionPayload({
      eventId: "evt-1",
      couponCode: "PRIYA10",
      businessId: "biz-1",
      businessName: "Acme Dental",
      clientEmail: "owner@acme.test",
      paymentId: "pay-1",
      paymentKind: "initial",
      amountCents: 269_910,
      currency: "INR",
      paidAt: new Date("2026-11-23T10:00:00Z"),
      attempts: 0,
    });
    expect(payload).toEqual({
      id: "evt-1",
      type: "coupon.paid",
      couponCode: "PRIYA10",
      client: { businessId: "biz-1", name: "Acme Dental", email: "owner@acme.test" },
      payment: { id: "pay-1", kind: "initial", amountCents: 269_910, currency: "INR", paidAt: "2026-11-23T10:00:00.000Z" },
    });
  });
});
