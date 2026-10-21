import type { BundledAddOn, BillingState } from "@brandbasket/db";
import { describe, expect, it, vi } from "vitest";
import { assessAddOn } from "./basket-change";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  BundledAddOnNotPossibleError: class BundledAddOnNotPossibleError extends Error {},
}));

const NOW = new Date("2026-11-05T06:00:00.000Z");
const PAID_AT = new Date("2026-10-19T00:00:00.000Z");
const PAID_THROUGH = new Date("2026-11-19T00:00:00.000Z");

const state = {
  upgradePaid: false,
  hasEverPaid: true,
  paymentUnderReview: false,
  plan: { currency: "INR", recurringAmountCents: 0, taxRateBasisPoints: 1_800 },
  subscription: {
    provider: "fake",
    status: "active",
    activatedAt: PAID_AT,
    commitmentEndsAt: PAID_THROUGH,
    paidThroughAt: PAID_THROUGH,
    cancelRequestedAt: null,
    discountAmountCents: 0,
  },
} as unknown as BillingState;

const line = (addOn: string, listAmountCents: number): BundledAddOn =>
  ({ id: `line-${addOn}`, addOn, status: "active", endRequestedAt: null, listAmountCents, offerDiscountAmountCents: 0, netAmountCents: listAmountCents }) as unknown as BundledAddOn;

describe("assessAddOn", () => {
  it("quotes the service as a line of the basket it joins", () => {
    const assessment = assessAddOn({ state, live: [line("managed-website", 300_000)], addOn: "digital-growth", forfeited: false, providerName: "fake", now: NOW });

    expect(assessment).toMatchObject({ kind: "offer", line: { listCents: 1_000_000, discountCents: 200_000, netCents: 800_000 }, quote: { nextRenewalCents: 1_227_200 } });
  });

  it("stops rather than price a basket that holds a line that is not a service, which would be quoted as no service at all", () => {
    expect(() =>
      assessAddOn({ state, live: [line("managed-website", 300_000), line("press-release", 100_000)], addOn: "digital-growth", forfeited: false, providerName: "fake", now: NOW }),
    ).toThrow(/press-release .* is not a monthly service/);
  });
});
