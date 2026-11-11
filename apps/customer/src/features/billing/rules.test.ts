import type { BundledAddOn, Charge, CurrentPaymentMethod, Receipt } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { adCreditCentsFor, packageLines } from "@brandbasket/shared/lib/billing/packages";
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/format";
import { orderSummary } from "../checkout/rules/membership";
import {
  addOnStatus,
  billView,
  CancelServiceForm,
  dropCopy,
  dropPreview,
  invoiceRows,
  nextPaymentLine,
  PACKAGE_ENDS,
  paymentMethodView,
  planStateOf,
  readAddParam,
  renewsAutomatically,
} from "./rules";

const NOW = new Date("2026-11-03T06:00:00.000Z");
const NEXT = new Date("2026-11-27T06:00:00.000Z");
const INR_PLAN = { recurringAmountCents: 0, currency: "INR", taxRateBasisPoints: 1_800 } as const;
const USD_PLAN = { recurringAmountCents: 0, currency: "USD", taxRateBasisPoints: 0 } as const;

// ---- Ported from apps/platform lib/billing/drop-service.test.ts ----

const WEBSITE = { addOn: "managed-website", listAmountCents: 299_900, taxRateBasisPoints: 1_800 } as const;
const SOCIAL = { addOn: "social-media", listAmountCents: 999_900, taxRateBasisPoints: 1_800 } as const;
const SEO = { addOn: "paid-ads", listAmountCents: 2_499_900, taxRateBasisPoints: 1_800 } as const;

describe("dropPreview", () => {
  it("dropping Paid Ads Management from all three keeps the other two at list, ₹12,998 a month with GST included, and says the package ends", () => {
    expect(dropPreview({ staying: [WEBSITE, SOCIAL, SEO], dropping: "paid-ads", forfeited: false, currency: "INR" })).toEqual({
      keeps: ["managed-website", "social-media"],
      newMonthlyCents: 1_299_800,
      currency: "INR",
      taxRateBasisPoints: 1_800,
      endsPackage: true,
      endsWebsite: false,
    });
  });

  it("prices the website kept alone at its list price, GST included", () => {
    expect(dropPreview({ staying: [WEBSITE, SOCIAL], dropping: "social-media", forfeited: false, currency: "INR" })).toMatchObject({ keeps: ["managed-website"], newMonthlyCents: 299_900, endsPackage: true });
  });

  it("prices from the list prices on the lines, not the package prices they are billed at now", () => {
    const discounted = [{ ...WEBSITE, offerDiscountAmountCents: 89_970 }, { ...SOCIAL, offerDiscountAmountCents: 299_970 }, SEO];
    expect(dropPreview({ staying: discounted, dropping: "paid-ads", forfeited: false, currency: "INR" })?.newMonthlyCents).toBe(1_299_800);
  });

  it("adds no GST in dollars", () => {
    const usd = (addOn: "managed-website" | "social-media", listAmountCents: number) => ({ addOn, listAmountCents, taxRateBasisPoints: 0 });
    expect(dropPreview({ staying: [usd("managed-website", 6_500), usd("social-media", 15_000)], dropping: "social-media", forfeited: false, currency: "USD" })).toMatchObject({
      keeps: ["managed-website"],
      newMonthlyCents: 6_500,
      currency: "USD",
      taxRateBasisPoints: 0,
    });
  });

  it("has nothing to lose once the offer is already given up", () => {
    expect(dropPreview({ staying: [WEBSITE, SOCIAL, SEO], dropping: "managed-website", forfeited: true, currency: "INR" })).toMatchObject({
      keeps: ["social-media", "paid-ads"],
      newMonthlyCents: 3_499_800,
      endsPackage: false,
      endsWebsite: true,
    });
  });

  it("offers no drop for the only service", () => {
    expect(dropPreview({ staying: [SOCIAL], dropping: "social-media", forfeited: false, currency: "INR" })).toBeNull();
  });
});

describe("dropCopy", () => {
  it("says what stays, the new monthly payment with GST, and that the package ends", () => {
    const preview = dropPreview({ staying: [WEBSITE, SOCIAL, SEO], dropping: "paid-ads", forfeited: false, currency: "INR" });
    if (preview === null) throw new Error("Expected a preview");
    expect(dropCopy(preview, "Fri 27 Nov")).toEqual({
      keeps: "You keep Website Management and Social Media Management.",
      monthly: "From Fri 27 Nov you pay ₹12,998 a month, GST included.",
      websiteOffline: null,
      packageEnds: PACKAGE_ENDS,
    });
  });

  it("names one service kept, says nothing about a package already given up, and adds no GST in dollars", () => {
    const usd = (addOn: "managed-website" | "social-media") => ({ addOn, listAmountCents: 6_500, taxRateBasisPoints: 0 });
    const preview = dropPreview({ staying: [usd("managed-website"), usd("social-media")], dropping: "social-media", forfeited: true, currency: "USD" });
    if (preview === null) throw new Error("Expected a preview");
    expect(dropCopy(preview, "Fri 27 Nov")).toEqual({ keeps: "You keep Website Management.", monthly: "From Fri 27 Nov you pay $65 a month.", websiteOffline: null, packageEnds: null });
  });

  it("says the website goes offline on the next billing date when it is the website being dropped", () => {
    const preview = dropPreview({ staying: [WEBSITE, SOCIAL, SEO], dropping: "managed-website", forfeited: false, currency: "INR" });
    if (preview === null) throw new Error("Expected a preview");
    const copy = dropCopy(preview, "Fri 27 Nov");
    expect(copy.websiteOffline).toBe("Your website goes offline on Fri 27 Nov.");
    expect(copy.keeps).toBe("You keep Social Media Management and Paid Ads Management.");
  });
});

// ---- Money: the bill equals the shared functions ----

/** The lines a first checkout of `services` writes: each at list with its package discount (packageLines). */
function linesFor(services: readonly MonthlyAddOnId[]): BundledAddOn[] {
  return packageLines({ services, forfeited: false }, "INR").map(
    (line) =>
      ({ addOn: line.addOn, status: "active", endRequestedAt: null, listAmountCents: line.listCents, offerDiscountAmountCents: line.discountCents, pendingOfferDiscountAmountCents: null, taxRateBasisPoints: line.taxRateBasisPoints }) as unknown as BundledAddOn,
  );
}

function subscriptionFor(services: readonly MonthlyAddOnId[]) {
  const netCents = packageLines({ services, forfeited: false }, "INR").reduce((sum, line) => sum + line.netCents, 0);
  return { bundledAddOnNetCents: netCents, pendingBundledAddOnNetCents: null, discountAmountCents: 0, nextDiscountAmountCents: null, adCreditCents: adCreditCentsFor(services, "INR") };
}

describe("billView", () => {
  it.each([
    [["managed-website"], 299_900, null],
    [["managed-website", "social-media"], 1_169_900, "Package discount, 10%"],
    [["managed-website", "social-media", "paid-ads"], 3_039_800, "Package discount, 20%"],
  ] as const)("bills %j at the checkout's own total, %i", (services, expectedCents, discountLabel) => {
    const bill = billView({ lines: linesFor(services), subscription: subscriptionFor(services), plan: INR_PLAN });
    const checkout = orderSummary({ planInitialAmountCents: 0, services, currency: "INR", taxRateBasisPoints: 1_800, forfeited: false, hasEverPaid: false }, 0);
    expect(bill.totalCents).toBe(checkout.totalCents);
    expect(bill.totalCents).toBe(expectedCents);
    expect(bill.gstLine).toBe(`Includes ${formatMoney(checkout.gstCents, "INR")} GST.`);
    expect(bill.rows.find((row) => row.discount)?.label ?? null).toBe(discountLabel);
  });

  it("matches the mock for all three: ₹37,997 list, ₹7,599 off, ₹30,398 a month with ₹4,636.98 GST (to the paisa) and ₹3,000 ad money", () => {
    const services = ["managed-website", "social-media", "paid-ads"] as const;
    const bill = billView({ lines: linesFor(services), subscription: subscriptionFor(services), plan: INR_PLAN });
    expect(bill.rows).toEqual([
      { label: "List price, 3 services", amount: "₹37,997", discount: false },
      { label: "Package discount, 20%", amount: "−₹7,599", discount: true },
    ]);
    expect(bill.total).toBe("₹30,398");
    expect(bill.gstLine).toBe("Includes ₹4,636.98 GST.");
    expect(bill.adMoneyLine).toBe("Monthly ad money of ₹3,000 is added to your ads.");
  });

  it("after cancelling Paid Ads Management, bills the two that stay at list: the dialog's new total, no package, no ad money", () => {
    const services = ["managed-website", "social-media", "paid-ads"] as const;
    const lines = linesFor(services);
    const preview = dropPreview({ staying: lines, dropping: "paid-ads", forfeited: false, currency: "INR" });
    // What removeBundledAddOn records: the line is ending, the others move to list, the subscription carries the new amount.
    const after = lines.map((line) => (line.addOn === "paid-ads" ? { ...line, endRequestedAt: NOW } : { ...line, pendingOfferDiscountAmountCents: 0 }));
    const bill = billView({
      lines: after.filter((line) => line.endRequestedAt === null),
      subscription: { ...subscriptionFor(services), pendingBundledAddOnNetCents: preview?.newMonthlyCents ?? null },
      plan: INR_PLAN,
    });
    expect(bill.totalCents).toBe(preview?.newMonthlyCents);
    expect(bill.total).toBe("₹12,998");
    expect(bill.rows).toEqual([{ label: "List price, 2 services", amount: "₹12,998", discount: false }]);
    expect(bill.adMoneyLine).toBeNull();
  });

  it("takes a code off the total and names it, as the renewal does", () => {
    const services = ["managed-website"] as const;
    const bill = billView({ lines: linesFor(services), subscription: { ...subscriptionFor(services), discountAmountCents: 50_000 }, plan: INR_PLAN });
    expect(bill.totalCents).toBe(249_900);
    expect(bill.rows).toContainEqual({ label: "Code discount", amount: "−₹500", discount: true });
  });

  it("says nothing about GST in dollars", () => {
    const line = { addOn: "managed-website", status: "active", endRequestedAt: null, listAmountCents: 6_500, offerDiscountAmountCents: 0, pendingOfferDiscountAmountCents: null, taxRateBasisPoints: 0 } as unknown as BundledAddOn;
    const bill = billView({ lines: [line], subscription: { bundledAddOnNetCents: 6_500, pendingBundledAddOnNetCents: null, discountAmountCents: 0, nextDiscountAmountCents: null, adCreditCents: 0 }, plan: USD_PLAN });
    expect(bill.total).toBe("$65");
    expect(bill.gstLine).toBeNull();
  });
});

describe("nextPaymentLine", () => {
  const subscription = { provider: "razorpay", cancelRequestedAt: null, commitmentEndsAt: null, paidThroughAt: NEXT } as const;

  it("names the amount and the date, and that prices include GST", () => {
    expect(nextPaymentLine({ subscription, totalCents: 3_039_800, plan: INR_PLAN, now: NOW })).toBe("Next payment ₹30,398 on Fri 27 Nov. All prices include 18% GST.");
  });

  it("never mentions GST in dollars", () => {
    expect(nextPaymentLine({ subscription, totalCents: 35_000, plan: USD_PLAN, now: NOW })).toBe("Next payment $350 on Fri 27 Nov.");
  });

  it("says there are no more payments once the plan is set to end", () => {
    expect(nextPaymentLine({ subscription: { ...subscription, cancelRequestedAt: NOW }, totalCents: 1, plan: INR_PLAN, now: NOW })).toBe("No more payments. Your plan ends on Fri 27 Nov.");
  });
});

describe("planStateOf", () => {
  const base = { status: "paid", paymentUnderReview: false, renewalFailingUntil: null } as const;
  it.each([
    [base, { kind: "paid" }],
    [{ ...base, renewalFailingUntil: NEXT }, { kind: "renewal-failing", until: NEXT }],
    [{ ...base, status: "lapsed" }, { kind: "lapsed" }],
    [{ ...base, status: "unpaid" }, { kind: "unpaid" }],
    [{ ...base, status: "unpaid", paymentUnderReview: true }, { kind: "under-review" }],
  ] as const)("reads %j as %j", (billing, state) => {
    expect(planStateOf(billing)).toEqual(state);
  });
});

describe("readAddParam", () => {
  it("maps the app's service names to the catalogue's and ignores anything else", () => {
    expect(readAddParam("social")).toBe("social-media");
    expect(readAddParam("search")).toBeNull();
    expect(readAddParam("website")).toBe("managed-website");
    expect(readAddParam("toString")).toBeNull();
    expect(readAddParam(["social", "search"])).toBeNull();
    expect(readAddParam(undefined)).toBeNull();
  });
});

describe("addOnStatus", () => {
  it("is a word for each state", () => {
    expect(addOnStatus({ kind: "available" }).word).toBe("Not added");
    expect(addOnStatus({ kind: "included", endsOn: null }).word).toBe("Active");
    expect(addOnStatus({ kind: "included", endsOn: NEXT }).word).toBe("Ending");
  });
});

describe("CancelServiceForm", () => {
  const parse = (data: Record<string, string>) => CancelServiceForm.safeParse(data);
  it("takes a service and an optional reason, trimmed, empty as none", () => {
    expect(parse({ addOn: "social-media", reason: "  Moving ads in-house. " }).data).toEqual({ addOn: "social-media", reason: "Moving ads in-house." });
    expect(parse({ addOn: "social-media", reason: "   " }).data).toEqual({ addOn: "social-media", reason: null });
    expect(parse({ addOn: "social-media" }).data).toEqual({ addOn: "social-media", reason: null });
  });
  it("refuses an unknown service and a reason over 500 characters", () => {
    expect(parse({ addOn: "premium" }).success).toBe(false);
    expect(parse({ addOn: "social-media", reason: "a".repeat(501) }).success).toBe(false);
  });
});

// ---- Ported from apps/platform lib/billing/payment-method-view.test.ts ----

const CARD: CurrentPaymentMethod = { provider: "razorpay", kind: "renewal", method: "card", cardNetwork: "Visa", cardType: "credit", cardLast4: "4366", upiVpa: null, manualReference: null, paidAt: new Date("2026-05-01T10:00:00.000Z") };
const BANK: CurrentPaymentMethod = { ...CARD, provider: "manual", kind: "initial", method: null, cardNetwork: null, cardType: null, cardLast4: null, manualReference: "NEFT 0921" };

describe("renewsAutomatically", () => {
  const live = { provider: "razorpay", cancelRequestedAt: null } as const;
  it("is true for a paid plan billed by the provider with no ending asked for", () => {
    expect(renewsAutomatically({ status: "paid", subscription: live })).toBe(true);
  });
  it.each([
    ["is billed by hand", { status: "paid", subscription: { ...live, provider: "manual" } }],
    ["has been asked to end", { status: "paid", subscription: { ...live, cancelRequestedAt: new Date() } }],
    ["has lapsed", { status: "lapsed", subscription: live }],
    ["has not been paid yet", { status: "unpaid", subscription: live }],
    ["has no subscription", { status: "paid", subscription: null }],
  ] as const)("is false for a plan that %s", (_name, facts) => {
    expect(renewsAutomatically(facts)).toBe(false);
  });
});

describe("paymentMethodView", () => {
  it("says a card renews by itself when the plan does, and only what was last used when not", () => {
    expect(paymentMethodView(CARD, true)).toEqual({ kind: "renews", label: "Visa credit card ending 4366" });
    expect(paymentMethodView(CARD, false)).toEqual({ kind: "last-paid", label: "Visa credit card ending 4366" });
  });
  it.each(["charge", "extra_publish"] as const)("does not call a %s payment's card the renewal method", (kind) => {
    expect(paymentMethodView({ ...CARD, kind }, true).kind).toBe("last-paid");
  });
  it("gives a bank transfer that paid for the plan with its reference, and never tells a card customer they pay by transfer", () => {
    expect(paymentMethodView(BANK, true)).toEqual({ kind: "bank-transfer", reference: "NEFT 0921" });
    expect(paymentMethodView({ ...BANK, kind: "charge" }, true)).toEqual({ kind: "last-paid", label: "Bank transfer, reference NEFT 0921" });
    expect(paymentMethodView({ ...BANK, kind: "charge" }, false)).toEqual({ kind: "bank-transfer", reference: "NEFT 0921" });
  });
});

describe("invoiceRows", () => {
  const receipt = (overrides: Partial<Receipt>): Receipt =>
    ({ id: "p1", status: "captured", attentionReason: null, taxInvoiceNumber: "FY/26-27/000041", sequence: 3, paidAt: new Date("2026-10-27T06:00:00Z"), createdAt: new Date("2026-10-27T06:00:00Z"), amountCents: 3_039_800, currency: "INR", ...overrides }) as Receipt;
  const charge = { id: "c1", status: "open", kind: "add_on", description: "Social & Ads for the rest of November", quantity: 1, createdAt: NOW, amountCents: 373_000, currency: "INR" } as unknown as Charge;

  it("puts a charge still to pay first, then payments by their invoice number, or receipt number without one", () => {
    const rows = invoiceRows([receipt({}), receipt({ id: "p0", taxInvoiceNumber: null, sequence: 1 })], [charge]);
    expect(rows.map((row) => [row.kind, row.status, row.amount])).toEqual([
      ["due", "To pay", "₹3,730"],
      ["payment", "Paid", "₹30,398"],
      ["payment", "Paid", "₹30,398"],
    ]);
    expect(rows[1]?.number).toBe("FY/26-27/000041");
    expect(rows[2]?.number).toMatch(/^#/);
  });

  it("says Failed with nothing to download for a failed attempt, and Refunded for a refund", () => {
    const [failed, refunded] = invoiceRows([receipt({ status: "failed" }), receipt({ id: "p2", status: "refunded" })], []);
    expect(failed).toMatchObject({ status: "Failed", downloadable: false });
    expect(refunded).toMatchObject({ status: "Refunded", downloadable: true });
  });
});
