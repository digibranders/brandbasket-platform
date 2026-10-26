import { BRANDBASKET_SAC, chargedAmountCents } from "@brandbasket/billing";
import { BillingRangeError } from "@brandbasket/billing/billing-range-error";
import { InvoiceAmountMismatchError } from "@brandbasket/billing/tax-invoice";
import type { AddOnSubscription, NewTaxInvoice, Payment, Plan, ScopedTransaction, TaxInvoice } from "@brandbasket/db";
import * as db from "@brandbasket/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvalidServicePeriodError,
  InvoiceDatedBeforePaymentError,
  issueTaxInvoice,
  issueTaxInvoiceSafely,
  planLineDescription,
  supplierFor,
  planLineDetail,
  planLineNote,
  servicePeriod,
  UnprintableInvoiceTextError,
  type BundledInvoiceAddOn,
  type InvoiceSource,
} from "./tax-invoicing";

vi.mock("server-only", () => ({}));

// Only the reads and writes an add-on invoice makes are faked; the rest of the package (isInvoiceablePayment, the types'
// runtime) stays real. The invoice builder, the text rules and the GST sums all run for real.
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  findAddOnSubscriptionForPayment: vi.fn(),
  findBillingProfile: vi.fn(),
  findReferralCodeForInvoice: vi.fn(),
  findSubscriptionById: vi.fn(),
  findInvoiceFallbackRecipient: vi.fn(),
  findPaymentForInvoice: vi.fn(),
  findTaxInvoiceByPaymentId: vi.fn(),
  lockPaymentForInvoice: vi.fn(),
  allocateInvoiceSerial: vi.fn(),
  insertTaxInvoice: vi.fn(),
}));

describe("servicePeriod", () => {
  it("reads as the days paid for, in India, ending the day before the next period starts", () => {
    expect(servicePeriod(new Date("2026-10-09T06:00:00Z"), new Date("2026-11-09T06:00:00Z"))).toBe("09 Oct to 08 Nov 2026");
    expect(servicePeriod(new Date("2026-12-20T06:00:00Z"), new Date("2027-01-20T06:00:00Z"))).toBe(
      "20 Dec 2026 to 19 Jan 2027",
    );
  });

  it("writes September as Sep, the way every other date on the invoice is written", () => {
    expect(servicePeriod(new Date("2026-09-01T06:00:00Z"), new Date("2026-10-01T06:00:00Z"))).toBe("01 Sep to 30 Sep 2026");
  });

  it("counts days in India, not UTC", () => {
    // 20:00 UTC on 31 Oct is 1 Nov in India.
    expect(servicePeriod(new Date("2026-10-31T20:00:00Z"), new Date("2026-11-30T20:00:00Z"))).toBe("01 Nov to 30 Nov 2026");
  });

  it("refuses a period that ends before it starts", () => {
    expect(() => servicePeriod(new Date("2026-11-09T06:00:00Z"), new Date("2026-10-09T06:00:00Z"))).toThrow(InvalidServicePeriodError);
    expect(() => servicePeriod(new Date("2026-11-09T06:00:00Z"), new Date("2026-11-09T06:00:00Z"))).toThrow(BillingRangeError);
  });
});

describe("the invoice refusals staff see a notice for", () => {
  it("are billing range errors with their own names, so existing handlers still catch them", () => {
    for (const error of [new UnprintableInvoiceTextError(), new InvoiceDatedBeforePaymentError(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-09T00:00:00Z")), new InvalidServicePeriodError(new Date(0), new Date(0))]) {
      expect(error).toBeInstanceOf(BillingRangeError);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it("say the same fixed thing for unprintable text, and never carry what was typed", () => {
    expect(new UnprintableInvoiceTextError().message).toBe("Some text on an invoice has characters the invoice cannot print");
  });

  it("name both dates of an invoice dated before its payment", () => {
    expect(new InvoiceDatedBeforePaymentError(new Date("2026-10-01T00:00:00.000Z"), new Date("2026-10-09T00:00:00.000Z")).message).toBe(
      "An invoice cannot be dated 2026-10-01T00:00:00.000Z, before its payment at 2026-10-09T00:00:00.000Z",
    );
  });
});

describe("what the invoice calls us", () => {
  it("names the plan under Brandbasket, whichever way the plan row is named", () => {
    expect(planLineDescription("Brandbasket Premium")).toBe("Brandbasket Premium plan");
    expect(planLineDescription("Care")).toBe("Brandbasket Care plan");
    expect(planLineDescription(" Brandbasket Care plan ")).toBe("Brandbasket Care plan");
  });

  it("prints the registered company trading as Brandbasket, with Brandbasket's own contact", () => {
    const supplier = supplierFor();
    expect(supplier).toMatchObject({ legalName: "Digibranders Private Limited", tradeName: "Brandbasket", email: "support@brandbasket.in", stateCode: "mh" });
    expect(JSON.stringify(supplier)).not.toMatch(/first\s?fold/i);
  });
});

describe("planLineDescription", () => {
  it("names the plan once, with Brandbasket in front and plan at the end", () => {
    expect(planLineDescription("Brandbasket Premium")).toBe("Brandbasket Premium plan");
    expect(planLineDescription("Premium")).toBe("Brandbasket Premium plan");
    expect(planLineDescription("Care")).toBe("Brandbasket Care plan");
    expect(planLineDescription(" Brandbasket Care plan ")).toBe("Brandbasket Care plan");
  });
});

describe("planLineDetail", () => {
  it("calls a monthly payment a monthly subscription, as the approved template does", () => {
    expect(planLineDetail(true, new Date("2026-10-09T06:00:00Z"), new Date("2026-11-09T06:00:00Z"))).toBe(
      "Monthly subscription, 09 Oct to 08 Nov 2026",
    );
  });

  it("still says monthly when the provider's cycle is a few seconds off a calendar month", () => {
    expect(planLineDetail(true, new Date("2026-10-09T09:00:03Z"), new Date("2026-11-09T08:59:58Z"))).toBe(
      "Monthly subscription, 09 Oct to 08 Nov 2026",
    );
  });

  it("calls any other period a subscription", () => {
    expect(planLineDetail(false, new Date("2026-10-09T06:00:00Z"), new Date("2027-01-09T06:00:00Z"))).toBe(
      "Subscription, 09 Oct 2026 to 08 Jan 2027",
    );
  });
});

describe("planLineNote", () => {
  const gaurav = { code: "GAURAV", discountKind: "percent", discountPercentBasisPoints: 2_000 } as const;
  const base = { coupon: gaurav, netAmountCents: 699_900, discountAmountCents: 139_980, retentionDiscountCents: 0 };

  it("gives a percent coupon its share when that is what it took off", () => {
    expect(planLineNote(base)).toBe("Coupon GAURAV applied, 20% off");
    expect(
      planLineNote({ ...base, coupon: { ...gaurav, code: "HALFTEN", discountPercentBasisPoints: 1_250 }, discountAmountCents: 87_488 }),
    ).toBe("Coupon HALFTEN applied, 12.5% off");
  });

  it("leaves the share off when the frozen discount is not that share of this price", () => {
    expect(planLineNote({ ...base, netAmountCents: 299_900 })).toBe("Coupon GAURAV applied");
  });

  it("names an amount coupon only, since the discount column shows what it took off", () => {
    expect(planLineNote({ ...base, coupon: { code: "FLAT", discountKind: "amount", discountPercentBasisPoints: null } })).toBe(
      "Coupon FLAT applied",
    );
  });

  it("names a stay offer, and the coupon only for the part of the discount that is the coupon's", () => {
    expect(planLineNote({ ...base, discountAmountCents: 139_980 + 69_990, retentionDiscountCents: 69_990 })).toBe(
      "Coupon GAURAV applied, 20% off. Stay offer applied",
    );
    expect(planLineNote({ ...base, coupon: null, discountAmountCents: 69_990, retentionDiscountCents: 69_990 })).toBe("Stay offer applied");
    expect(planLineNote({ ...base, discountAmountCents: 69_990, retentionDiscountCents: 69_990 })).toBe("Stay offer applied");
  });

  it("says nothing for an affiliate code that gives no discount, or for no discount at all", () => {
    expect(planLineNote({ ...base, coupon: { code: "ASHA", discountKind: null, discountPercentBasisPoints: null }, discountAmountCents: 0 })).toBeNull();
    expect(planLineNote({ ...base, coupon: null, discountAmountCents: 0 })).toBeNull();
  });

  it("refuses a stay offer larger than the whole discount", () => {
    expect(() => planLineNote({ ...base, discountAmountCents: 10, retentionDiscountCents: 20 })).toThrow(BillingRangeError);
  });
});

describe("issueTaxInvoiceSafely", () => {
  const payment: Payment = {
    id: "payment-1",
    businessId: "business-1",
    subscriptionId: null,
    provider: "fake",
    providerPaymentId: "fake_pay_1",
    kind: "charge",
    amountCents: 117_764,
    currency: "INR",
    status: "captured",
    paidAt: new Date("2026-10-09T09:00:00Z"),
    failureReason: null,
    attentionReason: null,
    attentionResolvedAt: null,
    createdAt: new Date("2026-10-09T09:00:00Z"),
  };

  /** A transaction whose savepoint fails with `error` before any query runs. */
  function failingTransaction(error: Error): ScopedTransaction {
    return { transaction: () => Promise.reject(error) } as unknown as ScopedTransaction;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets a lost connection through, since the payment's own transaction cannot commit either", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lost = new Error("Connection terminated unexpectedly");

    await expect(issueTaxInvoiceSafely(failingTransaction(lost), payment, { kind: "charge", chargeId: "charge-1" })).rejects.toBe(lost);
    expect(error).not.toHaveBeenCalled();
  });

  it("logs any other failure and returns null", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      issueTaxInvoiceSafely(failingTransaction(new Error("deadlock detected")), payment, { kind: "charge", chargeId: "charge-1" }),
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("tax-invoice-failed"));
  });
});

/** Fakes the rest of what an invoice reads and writes (the customer, the number, the insert), and returns what the insert was handed. */
function arrangeInvoiceStore(): { readonly inserted: () => NewTaxInvoice } {
  vi.mocked(db.lockPaymentForInvoice).mockResolvedValue(undefined);
  vi.mocked(db.findTaxInvoiceByPaymentId).mockResolvedValue(null);
  vi.mocked(db.findBillingProfile).mockResolvedValue({
    businessId: "business-1",
    legalName: "QA Premium Business LLP",
    gstin: "27AAPFU0939F1ZV",
    addressLine1: "Shop 4, Gokul Arcade",
    addressLine2: null,
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
    email: null,
    phone: null,
  } as Awaited<ReturnType<typeof db.findBillingProfile>>);
  vi.mocked(db.findPaymentForInvoice).mockResolvedValue({
    provider: "razorpay",
    providerPaymentId: "pay_addon_1",
    method: "upi",
    cardNetwork: null,
    cardType: null,
    cardLast4: null,
    upiVpa: "qa@okhdfc",
    manualReference: null,
  });
  vi.mocked(db.allocateInvoiceSerial).mockResolvedValue(1);
  vi.mocked(db.insertTaxInvoice).mockImplementation((_runner, invoice) => Promise.resolve(invoice as unknown as TaxInvoice));
  return { inserted: () => vi.mocked(db.insertTaxInvoice).mock.calls[0]?.[1] as NewTaxInvoice };
}

describe("issueTaxInvoice for an add-on payment", () => {
  const PERIOD_START = new Date("2026-10-12T06:00:00Z");
  const PERIOD_END = new Date("2026-11-12T06:00:00Z");
  const tx = {} as ScopedTransaction;

  function addOnPayment(amountCents: number): Payment {
    return {
      id: "payment-1",
      businessId: "business-1",
      subscriptionId: null,
      provider: "razorpay",
      providerPaymentId: "pay_addon_1",
      kind: "add_on",
      amountCents,
      currency: "INR",
      status: "captured",
      paidAt: PERIOD_START,
      failureReason: null,
      attentionReason: null,
      attentionResolvedAt: null,
      createdAt: PERIOD_START,
    };
  }

  /** Social Media and Ads at its list price of 9,999 rupees, with a discount when `discountAmountCents` is given. */
  function addOnRow(overrides: Partial<AddOnSubscription> = {}): AddOnSubscription {
    const discountAmountCents = overrides.discountAmountCents ?? 0;
    return {
      offerDiscountAmountCents: discountAmountCents,
      id: "add-on-1",
      businessId: "business-1",
      addOn: "digital-growth",
      listAmountCents: 999_900,
      discountAmountCents,
      netAmountCents: 999_900 - discountAmountCents,
      taxRateBasisPoints: 1_800,
      chargedAmountCents: 0,
      currency: "INR",
      provider: "razorpay",
      providerSubscriptionId: "sub_addon_1",
      providerPlanId: "plan_addon_1",
      providerStatus: null,
      status: "active",
      startAt: null,
      activatedAt: PERIOD_START,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      haltedAt: null,
      endKind: null,
      endRequestedAt: null,
      endRequestedByStaffId: null,
      endedAt: null,
      continuesId: null,
      contactedAt: null,
      contactedByStaffId: null,
      createdAt: PERIOD_START,
      updatedAt: PERIOD_START,
      ...overrides,
    };
  }

  /** Fakes the database around one add-on payment, and returns what the invoice insert was handed. */
  function arrange(row: AddOnSubscription | null): { readonly inserted: () => NewTaxInvoice } {
    vi.mocked(db.findAddOnSubscriptionForPayment).mockResolvedValue(row);
    return arrangeInvoiceStore();
  }

  const source = { kind: "add_on", addOnSubscriptionId: "add-on-1", periodStart: PERIOD_START, periodEnd: PERIOD_END } as const;

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("gives a Social Media and Ads payment with a discount one line with the period and the discount, and no offer note", async () => {
    const { inserted } = arrange(addOnRow({ discountAmountCents: 50_000 }));

    await issueTaxInvoice(tx, addOnPayment(949_900), source);

    expect(inserted().lines).toHaveLength(1);
    expect(inserted().lines[0]).toMatchObject({
      description: "Social Media and Ads",
      detail: "Monthly subscription, 12 Oct to 11 Nov 2026",
      note: null,
      sac: BRANDBASKET_SAC,
      quantity: 1,
      unitAmountCents: 999_900,
      discountAmountCents: 50_000,
      taxRateBasisPoints: 1_800,
    });
    // ₹9,499 paid, with 144,900 paise of GST inside it (₹9,499 x 9 / 118, doubled for CGST and SGST).
    expect(inserted()).toMatchObject({ taxableCents: 805_000, cgstCents: 72_450, sgstCents: 72_450, roundOffCents: 0, totalCents: 949_900 });
  });

  it("leaves the note off when there is no discount", async () => {
    const { inserted } = arrange(addOnRow());

    await issueTaxInvoice(tx, addOnPayment(999_900), source);

    expect(inserted().lines[0]).toMatchObject({ description: "Social Media and Ads", note: null, discountAmountCents: 0 });
    expect(inserted()).toMatchObject({ taxableCents: 847_372, cgstCents: 76_264, sgstCents: 76_264, totalCents: 999_900 });
  });

  it("names Local SEO + AEO by its catalogue title", async () => {
    const { inserted } = arrange(addOnRow({ addOn: "local-seo-aeo", listAmountCents: 800_000, netAmountCents: 800_000 }));

    await issueTaxInvoice(tx, addOnPayment(800_000), source);

    expect(inserted().lines[0]).toMatchObject({ description: "Local SEO + AEO", unitAmountCents: 800_000 });
  });

  it("refuses a payment that is not linked to an add-on, without issuing or taking a number", async () => {
    arrange(null);

    await expect(issueTaxInvoice(tx, addOnPayment(999_900), source)).rejects.toThrow("not linked to an add-on subscription");
    expect(db.allocateInvoiceSerial).not.toHaveBeenCalled();
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses a payment linked to a different add-on than the source names", async () => {
    arrange(addOnRow({ id: "add-on-2" }));

    await expect(issueTaxInvoice(tx, addOnPayment(999_900), source)).rejects.toThrow("not add-on subscription add-on-1");
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses an add-on that is not in rupees", async () => {
    arrange(addOnRow({ currency: "USD" }));

    await expect(issueTaxInvoice(tx, addOnPayment(999_900), source)).rejects.toThrow("not in rupees");
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses an add-on that is not a monthly catalogue add-on", async () => {
    arrange(addOnRow({ addOn: "press-release" }));

    await expect(issueTaxInvoice(tx, addOnPayment(999_900), source)).rejects.toThrow("not a monthly add-on");
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses a payment the add-on's price does not explain, so the invoice never disagrees with the charge", async () => {
    arrange(addOnRow({ discountAmountCents: 100_000 }));

    await expect(issueTaxInvoice(tx, addOnPayment(999_900), source)).rejects.toBeInstanceOf(
      InvoiceAmountMismatchError,
    );
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });
});

describe("issueTaxInvoice for a payment of services", () => {
  const PERIOD_START = new Date("2026-10-12T06:00:00Z");
  const PERIOD_END = new Date("2026-11-12T06:00:00Z");
  const tx = {} as ScopedTransaction;
  /** The plan row is the subscription's terms and costs nothing: only its name and tax rate are read. */
  const plan = { name: "Brandbasket services", taxRateBasisPoints: 1_800, initialTermMonths: 1 } as Plan;

  const payment = (amountCents: number): Payment => ({
    id: "payment-1",
    businessId: "business-1",
    subscriptionId: null,
    provider: "razorpay",
    providerPaymentId: "pay_services_1",
    kind: "initial",
    amountCents,
    currency: "INR",
    status: "captured",
    paidAt: PERIOD_START,
    failureReason: null,
    attentionReason: null,
    attentionResolvedAt: null,
    createdAt: PERIOD_START,
  });

  const line = (addOn: string, listAmountCents: number, offerDiscountAmountCents: number): BundledInvoiceAddOn => ({
    addOn,
    listAmountCents,
    offerDiscountAmountCents,
    taxRateBasisPoints: 1_800,
  });
  const WEBSITE = 299_900;
  const SOCIAL = 999_900;
  const SEO = 2_499_900;

  const source = (bundledAddOns: readonly BundledInvoiceAddOn[], discountAmountCents = 0): InvoiceSource => ({
    kind: "plan",
    plan,
    bundledAddOns,
    netAmountCents: 0,
    discountAmountCents,
    retentionDiscountCents: 0,
    monthly: true,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("gives all three services a line each with its package discount, and no line for the plan row that costs nothing", async () => {
    const { inserted } = arrangeInvoiceStore();

    // The package is 20% off all three, as a whole-rupee saving of ₹7,599: the lines' own 20% is 40 paise more, taken off the dearest.
    await issueTaxInvoice(tx, payment(3_039_800), source([line("managed-website", WEBSITE, 59_980), line("digital-growth", SOCIAL, 199_980), line("local-seo-aeo", SEO, 499_940)]));

    expect(inserted().lines.map((l) => [l.description, l.unitAmountCents, l.discountAmountCents, l.note])).toEqual([
      ["Managed Website", 299_900, 59_980, "Package offer, 20% off"],
      ["Social Media and Ads", 999_900, 199_980, "Package offer, 20% off"],
      ["Local SEO + AEO", 2_499_900, 499_940, "Package offer, 20% off"],
    ]);
    // ₹30,398 paid holds 463,698 paise of GST (₹30,398 x 9 / 118 rounded to a whole paisa, doubled): 231,849 each of CGST and SGST.
    expect(inserted()).toMatchObject({ taxableCents: 2_576_102, cgstCents: 231_849, sgstCents: 231_849, roundOffCents: 0, totalCents: 3_039_800 });
    expect(inserted().lines.every((l) => l.detail === "Monthly subscription, 12 Oct to 11 Nov 2026")).toBe(true);
  });

  it("never mentions ad credit on the invoice", async () => {
    const { inserted } = arrangeInvoiceStore();

    await issueTaxInvoice(tx, payment(3_039_800), source([line("managed-website", WEBSITE, 59_980), line("digital-growth", SOCIAL, 199_980), line("local-seo-aeo", SEO, 499_940)]));

    expect(JSON.stringify(inserted().lines)).not.toMatch(/credit/i);
  });

  it("names the package's percentage even when a line's discount has a few paise more in it than that percentage", async () => {
    const { inserted } = arrangeInvoiceStore();
    // ₹2,999 and ₹9,999 at 10% off, the package total floored to the whole rupee: the dearest line carries 80 paise less
    // than its own 10%, so it holds 99,910 against the 99,990 a tenth of its price comes to.
    const paid = 299_900 - 29_990 + (999_900 - 99_910);
    expect(paid).toBe(1_169_900);

    await issueTaxInvoice(tx, payment(1_169_900), source([line("managed-website", 299_900, 29_990), line("digital-growth", 999_900, 99_910)]));

    expect(inserted().lines.map((l) => l.note)).toEqual(["Package offer, 10% off", "Package offer, 10% off"]);
    expect(inserted()).toMatchObject({ taxableCents: 991_440, cgstCents: 89_230, sgstCents: 89_230, totalCents: 1_169_900, roundOffCents: 0 });
  });

  it("gives a single service no discount and no note", async () => {
    const { inserted } = arrangeInvoiceStore();

    await issueTaxInvoice(tx, payment(999_900), source([line("digital-growth", SOCIAL, 0)]));

    expect(inserted().lines).toHaveLength(1);
    expect(inserted().lines[0]).toMatchObject({ description: "Social Media and Ads", discountAmountCents: 0, note: null });
    expect(inserted().totalCents).toBe(999_900);
  });

  it("leaves a service whose package offer has ended at list, with no note", async () => {
    const { inserted } = arrangeInvoiceStore();

    await issueTaxInvoice(tx, payment(1_299_800), source([line("managed-website", WEBSITE, 0), line("digital-growth", SOCIAL, 0)]));

    expect(inserted().lines.map((l) => [l.discountAmountCents, l.note])).toEqual([
      [0, null],
      [0, null],
    ]);
  });

  it("refuses a package discount on a set of services that earns no package", async () => {
    arrangeInvoiceStore();

    await expect(issueTaxInvoice(tx, payment(949_900), source([line("digital-growth", SOCIAL, 50_000)]))).rejects.toThrow(/earn no package offer/);
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses a line that is not a catalogue service, as before", async () => {
    arrangeInvoiceStore();

    await expect(issueTaxInvoice(tx, payment(999_900), source([line("press-release", SOCIAL, 0)]))).rejects.toThrow("not a monthly add-on");
  });

  describe("with a referral code taken once off the package", () => {
    /** The payment is on a subscription carrying the code, which the invoice reads to name it on each line it touches. */
    const withCode = (code: { discountKind: "amount" | "percent"; discountPercentBasisPoints: number | null }): void => {
      vi.mocked(db.findSubscriptionById).mockResolvedValue({ referralCodeId: "code-1" } as Awaited<ReturnType<typeof db.findSubscriptionById>>);
      vi.mocked(db.findReferralCodeForInvoice).mockResolvedValue({ code: "SAVE10", ...code });
    };
    const paymentOn = (amountCents: number): Payment => ({ ...payment(amountCents), subscriptionId: "sub-1" });

    it("shares the code over two lines in proportion to their nets, the leftover paisa on the larger, adding up to the paisa", async () => {
      const { inserted } = arrangeInvoiceStore();
      withCode({ discountKind: "amount", discountPercentBasisPoints: null });
      // Prices after the 10% package offer: ₹2,699.10 and ₹8,999.90. A ₹1,500 code is 34,606.4 and 115,393.6 paise of it:
      // each share rounded down (34,606 and 115,393), the one paisa left on the larger line.
      const lines = [line("managed-website", WEBSITE, 29_990), line("digital-growth", SOCIAL, 99_910)];

      await issueTaxInvoice(tx, paymentOn(chargedAmountCents(1_169_900, 150_000)), source(lines, 150_000));

      expect(inserted().lines.map((l) => [l.description, l.discountAmountCents, l.note])).toEqual([
        ["Managed Website", 29_990 + 34_606, "Package offer, 10% off. Coupon SAVE10 applied"],
        ["Social Media and Ads", 99_910 + 115_394, "Package offer, 10% off. Coupon SAVE10 applied"],
      ]);
      const codeShares = inserted().lines.map((l, i) => l.discountAmountCents - [29_990, 99_910][i]!);
      expect(codeShares.reduce((total, share) => total + share, 0)).toBe(150_000);
      // ₹10,199 paid holds 155,578 paise of GST.
      expect(inserted()).toMatchObject({ taxableCents: 864_322, cgstCents: 77_789, sgstCents: 77_789, totalCents: 1_019_900 });
    });

    it("shares it over three lines the same way, and the invoice still comes to what was charged", async () => {
      const { inserted } = arrangeInvoiceStore();
      withCode({ discountKind: "amount", discountPercentBasisPoints: null });
      const lines = [line("managed-website", WEBSITE, 59_980), line("digital-growth", SOCIAL, 199_980), line("local-seo-aeo", SEO, 499_940)];

      // A ₹1,000 code over prices of 239,920, 799,920 and 1,999,960 paise (3,039,800 together): 7,892.4, 26,314.4 and 65,793.2
      // rounded down, the 2 paise left on the largest line.
      await issueTaxInvoice(tx, paymentOn(chargedAmountCents(3_039_800, 100_000)), source(lines, 100_000));

      expect(inserted().lines.map((l) => l.discountAmountCents)).toEqual([59_980 + 7_892, 199_980 + 26_314, 499_940 + 65_794]);
      expect(inserted().lines.every((l) => l.note === "Package offer, 20% off. Coupon SAVE10 applied")).toBe(true);
      expect(inserted()).toMatchObject({ taxableCents: 2_491_356, cgstCents: 224_222, sgstCents: 224_222, totalCents: 2_939_800 });
    });

    it("names a percentage code without a share on a package, since no line holds that share of its own net", async () => {
      const { inserted } = arrangeInvoiceStore();
      withCode({ discountKind: "percent", discountPercentBasisPoints: 1_000 });
      const lines = [line("managed-website", WEBSITE, 29_990), line("digital-growth", SOCIAL, 99_910)];

      await issueTaxInvoice(tx, paymentOn(chargedAmountCents(1_169_900, 116_990)), source(lines, 116_990));

      expect(inserted().lines.map((l) => l.note)).toEqual(["Package offer, 10% off. Coupon SAVE10 applied", "Package offer, 10% off. Coupon SAVE10 applied"]);
    });

    it("keeps naming the share on a single service", async () => {
      const { inserted } = arrangeInvoiceStore();
      withCode({ discountKind: "percent", discountPercentBasisPoints: 1_000 });

      await issueTaxInvoice(tx, paymentOn(chargedAmountCents(SOCIAL, 99_990)), source([line("digital-growth", SOCIAL, 0)], 99_990));

      expect(inserted().lines).toHaveLength(1);
      expect(inserted().lines[0]).toMatchObject({ discountAmountCents: 99_990, note: "Coupon SAVE10 applied, 10% off" });
    });

    it("leaves a line the code gave nothing to without a code note", async () => {
      const { inserted } = arrangeInvoiceStore();
      withCode({ discountKind: "amount", discountPercentBasisPoints: null });
      // One paisa over two lines: the whole of it lands on the larger, so the smaller line is untouched.
      const lines = [line("managed-website", WEBSITE, 29_990), line("digital-growth", SOCIAL, 99_910)];

      await issueTaxInvoice(tx, paymentOn(chargedAmountCents(1_169_900, 1)), source(lines, 1));

      expect(inserted().lines.map((l) => l.note)).toEqual(["Package offer, 10% off", "Package offer, 10% off. Coupon SAVE10 applied"]);
    });
  });
});
