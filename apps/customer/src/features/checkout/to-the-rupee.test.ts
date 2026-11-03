import { chargedAmountCents, gstInsideCents } from "@brandbasket/billing";
import { bundledNetCents, type ReferralCode, type ReferralDiscount } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { adCreditCentsAtCheckout, packageLines } from "@brandbasket/shared/lib/billing/packages";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { describe, expect, it, vi } from "vitest";
import { ledgerSummary } from "./rules/ledger";
import { discountFrom } from "./server/referrals";

vi.mock("server-only", () => ({}));
vi.mock("./server/db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));

/*
 * To the rupee: the price the new checkout shows (rules/ledger.ts) against what the old checkout charged, worked out with the
 * very functions apps/platform lib/server/checkout.ts openPlanCheckout uses under its lock: the package lines (packageLines),
 * their net (bundledNetCents), the code priced against that net (discountFrom), the amount the provider takes
 * (chargedAmountCents) and the ad credit (adCreditCentsAtCheckout). The first payment's confirmation checks the same amount
 * (payment-confirmation.ts expectedFirstPaymentCents), and the tax invoice splits the GST inside it (gstInsideCents).
 */

const WEBSITE: readonly MonthlyAddOnId[] = ["managed-website"];
const TWO: readonly MonthlyAddOnId[] = ["managed-website", "digital-growth"];
const THREE: readonly MonthlyAddOnId[] = ["managed-website", "digital-growth", "local-seo-aeo"];

/** The services plan as sold: the plan row costs nothing, the lines are the charge. INR carries 18% GST inside; USD none. */
const PLAN: Readonly<Record<MoneyCurrency, { readonly initialAmountCents: number; readonly taxRateBasisPoints: number }>> = {
  INR: { initialAmountCents: 0, taxRateBasisPoints: 1_800 },
  USD: { initialAmountCents: 0, taxRateBasisPoints: 0 },
};

function code(currency: MoneyCurrency, discount: ReferralDiscount): ReferralCode {
  return { id: "code-1", code: "FRIEND10", currency, discount, discountMonths: 3 } as unknown as ReferralCode;
}

/** What the old checkout froze and charged for a basket and a code. */
function oldCheckout(services: readonly MonthlyAddOnId[], currency: MoneyCurrency, referral: ReferralCode | null) {
  const plan = PLAN[currency];
  const bundle = packageLines({ services, forfeited: false }, currency).map((line) => ({ netAmountCents: line.netCents }));
  const net = bundledNetCents(bundle);
  const discount = referral === null ? null : discountFrom(referral, { currency, netCents: net });
  const totalCents = chargedAmountCents(plan.initialAmountCents + net, discount?.amountCents ?? 0);
  return {
    totalCents,
    discountCents: discount?.amountCents ?? 0,
    gstCents: gstInsideCents(totalCents, plan.taxRateBasisPoints),
    adCreditCents: adCreditCentsAtCheckout({ services, forfeited: false, hasEverPaid: false }, currency),
  };
}

/** What the new checkout page shows for the same inputs. */
function newCheckout(services: readonly MonthlyAddOnId[], currency: MoneyCurrency, referral: ReferralCode | null) {
  const plan = PLAN[currency];
  const pricing = { planInitialAmountCents: plan.initialAmountCents, currency, taxRateBasisPoints: plan.taxRateBasisPoints, forfeited: false, hasEverPaid: false };
  const ledgerCode = referral === null ? null : { code: referral.code, stated: referral.discount, months: referral.discountMonths };
  const summary = ledgerSummary(pricing, services, ledgerCode);
  return { totalCents: summary.totalCents, discountCents: summary.discountCents, gstCents: summary.gstCents, adCreditCents: summary.adCredit?.cents ?? 0 };
}

const BASKETS = [
  ["one service", WEBSITE],
  ["two services (10% package)", TWO],
  ["three services (20% package)", THREE],
] as const;

const CODES = {
  none: null,
  "10% code": { kind: "percent", basisPoints: 1_000 },
  "flat code": { kind: "amount", amountCents: 50_000 },
} as const satisfies Readonly<Record<string, ReferralDiscount | null>>;

describe("the new checkout charges what the old one did, to the rupee", () => {
  for (const currency of ["INR", "USD"] as const) {
    for (const [basket, services] of BASKETS) {
      for (const [label, discount] of Object.entries(CODES)) {
        it(`${currency}, ${basket}, ${label}`, () => {
          const referral = discount === null ? null : code(currency, discount);
          expect(newCheckout(services, currency, referral)).toEqual(oldCheckout(services, currency, referral));
        });
      }
    }
  }

  it("lands on the published prices, GST included in rupees and none in dollars", () => {
    expect([WEBSITE, TWO, THREE].map((services) => newCheckout(services, "INR", null).totalCents)).toEqual([299_900, 1_169_900, 3_039_800]);
    expect([WEBSITE, TWO, THREE].map((services) => newCheckout(services, "USD", null).totalCents)).toEqual([6_500, 19_400, 45_200]);
    expect(newCheckout(THREE, "USD", null).gstCents).toBe(0);
  });

  it("grants the first-payment ad money only for packages", () => {
    expect(newCheckout(WEBSITE, "INR", null).adCreditCents).toBe(0);
    expect(newCheckout(TWO, "INR", null).adCreditCents).toBe(150_000);
    expect(newCheckout(THREE, "INR", null).adCreditCents).toBe(300_000);
  });
});
