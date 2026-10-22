import type { BundledAddOn, BillingState, ReferralCode } from "@brandbasket/db";
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
    discountMonthsLeft: null,
    nextDiscountAmountCents: null,
  },
} as unknown as BillingState;

const line = (addOn: string, listAmountCents: number): BundledAddOn =>
  ({ id: `line-${addOn}`, addOn, status: "active", endRequestedAt: null, listAmountCents, offerDiscountAmountCents: 0, netAmountCents: listAmountCents }) as unknown as BundledAddOn;

describe("assessAddOn", () => {
  it("quotes the service as a line of the basket it joins", () => {
    const assessment = assessAddOn({ state, live: [line("managed-website", 299_900)], addOn: "digital-growth", forfeited: false, providerName: "fake", now: NOW });

    expect(assessment).toMatchObject({ kind: "offer", line: { listCents: 999_900, discountCents: 200_020, netCents: 799_880 }, quote: { nextRenewalCents: 1_226_964 } });
  });

  it("quotes the next renewal of the whole package when the leftover lands on a line already there", () => {
    const assessment = assessAddOn({ state, live: [line("local-seo-aeo", 2_499_900)], addOn: "managed-website", forfeited: false, providerName: "fake", now: NOW });

    // Website + SEO is 2,239,800 net: the website takes its 20%, and the SEO line already there takes the 40 paise.
    expect(assessment).toMatchObject({ kind: "offer", line: { discountCents: 59_980, netCents: 239_920 }, quote: { nextRenewalCents: 2_642_964 } });
  });

  it("quotes the next renewal at list once the offer is given up", () => {
    const assessment = assessAddOn({ state, live: [line("managed-website", 299_900)], addOn: "digital-growth", forfeited: true, providerName: "fake", now: NOW });

    expect(assessment).toMatchObject({ kind: "offer", line: { discountCents: 0, netCents: 999_900 }, quote: { nextRenewalCents: 1_533_764 } });
  });

  describe("with a referral code on the subscription", () => {
    const withCode = (held: Partial<{ discountAmountCents: number; discountMonthsLeft: number | null; nextDiscountAmountCents: number | null }>): BillingState =>
      ({ ...state, subscription: { ...state.subscription, ...held } }) as BillingState;
    const codeOf = (discount: ReferralCode["discount"]): ReferralCode => ({ discount }) as ReferralCode;
    const website = [line("managed-website", 299_900)];

    it("keeps an amount code's amount through an add", () => {
      const assessment = assessAddOn({
        state: withCode({ discountAmountCents: 50_000 }),
        live: website,
        addOn: "digital-growth",
        forfeited: false,
        code: codeOf({ kind: "amount", amountCents: 50_000 }),
        providerName: "fake",
        now: NOW,
      });

      // The pair nets 10,398; less the 500, with 18% GST.
      expect(assessment).toMatchObject({ kind: "offer", quote: { nextRenewalCents: 1_226_964 - 59_000 } });
    });

    it("reprices a percentage code on the new basket's net", () => {
      const assessment = assessAddOn({
        state: withCode({ discountAmountCents: 29_990 }),
        live: website,
        addOn: "digital-growth",
        forfeited: false,
        code: codeOf({ kind: "percent", basisPoints: 1_000 }),
        providerName: "fake",
        now: NOW,
      });

      // 10% of the 10,398 the pair nets is 1,039.80, not the 299.90 it took off the website alone; 18% GST on what is left.
      expect(assessment).toMatchObject({ kind: "offer", quote: { nextRenewalCents: 1_104_268 } });
    });

    it("takes nothing once the code's months have run out", () => {
      const assessment = assessAddOn({
        state: withCode({ discountAmountCents: 0, discountMonthsLeft: 0 }),
        live: website,
        addOn: "digital-growth",
        forfeited: false,
        code: codeOf({ kind: "percent", basisPoints: 1_000 }),
        providerName: "fake",
        now: NOW,
      });

      expect(assessment).toMatchObject({ kind: "offer", quote: { nextRenewalCents: 1_226_964 } });
    });
  });

  it("stops rather than price a basket that holds a line that is not a service, which would be quoted as no service at all", () => {
    expect(() =>
      assessAddOn({ state, live: [line("managed-website", 299_900), line("press-release", 100_000)], addOn: "digital-growth", forfeited: false, providerName: "fake", now: NOW }),
    ).toThrow(/press-release .* is not a monthly service/);
  });
});
