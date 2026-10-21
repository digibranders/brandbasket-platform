import { BRANDBASKET_SAC } from "@brandbasket/billing";
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
    expect(supplier).toMatchObject({ legalName: "Digibranders Private Limited", tradeName: "Brandbasket", email: "hello@brandbasket.in", stateCode: "mh" });
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

  /** Social Media and Ads at a round list price of 10,000 rupees, with a discount when `discountAmountCents` is given. */
  function addOnRow(overrides: Partial<AddOnSubscription> = {}): AddOnSubscription {
    const discountAmountCents = overrides.discountAmountCents ?? 0;
    return {
      offerDiscountAmountCents: discountAmountCents,
      id: "add-on-1",
      businessId: "business-1",
      addOn: "digital-growth",
      listAmountCents: 1_000_000,
      discountAmountCents,
      netAmountCents: 1_000_000 - discountAmountCents,
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

    await issueTaxInvoice(tx, addOnPayment(1_121_000), source);

    expect(inserted().lines).toHaveLength(1);
    expect(inserted().lines[0]).toMatchObject({
      description: "Social Media and Ads",
      detail: "Monthly subscription, 12 Oct to 11 Nov 2026",
      note: null,
      sac: BRANDBASKET_SAC,
      quantity: 1,
      unitAmountCents: 1_000_000,
      discountAmountCents: 50_000,
      taxRateBasisPoints: 1_800,
    });
    expect(inserted().taxableCents).toBe(950_000);
    expect(inserted().totalCents).toBe(1_121_000);
  });

  it("leaves the note off when there is no discount", async () => {
    const { inserted } = arrange(addOnRow());

    await issueTaxInvoice(tx, addOnPayment(1_180_000), source);

    expect(inserted().lines[0]).toMatchObject({ description: "Social Media and Ads", note: null, discountAmountCents: 0 });
    expect(inserted().totalCents).toBe(1_180_000);
  });

  it("names Local SEO + AEO by its catalogue title", async () => {
    const { inserted } = arrange(addOnRow({ addOn: "local-seo-aeo", listAmountCents: 800_000, netAmountCents: 800_000 }));

    await issueTaxInvoice(tx, addOnPayment(944_000), source);

    expect(inserted().lines[0]).toMatchObject({ description: "Local SEO + AEO", unitAmountCents: 800_000 });
  });

  it("refuses a payment that is not linked to an add-on, without issuing or taking a number", async () => {
    arrange(null);

    await expect(issueTaxInvoice(tx, addOnPayment(1_180_000), source)).rejects.toThrow("not linked to an add-on subscription");
    expect(db.allocateInvoiceSerial).not.toHaveBeenCalled();
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses a payment linked to a different add-on than the source names", async () => {
    arrange(addOnRow({ id: "add-on-2" }));

    await expect(issueTaxInvoice(tx, addOnPayment(1_180_000), source)).rejects.toThrow("not add-on subscription add-on-1");
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses an add-on that is not in rupees", async () => {
    arrange(addOnRow({ currency: "USD" }));

    await expect(issueTaxInvoice(tx, addOnPayment(1_180_000), source)).rejects.toThrow("not in rupees");
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses an add-on that is not a monthly catalogue add-on", async () => {
    arrange(addOnRow({ addOn: "press-release" }));

    await expect(issueTaxInvoice(tx, addOnPayment(1_180_000), source)).rejects.toThrow("not a monthly add-on");
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses a payment the add-on's price does not explain, so the invoice never disagrees with the charge", async () => {
    arrange(addOnRow({ discountAmountCents: 100_000 }));

    await expect(issueTaxInvoice(tx, addOnPayment(1_180_000), source)).rejects.toBeInstanceOf(
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
  const WEBSITE = 300_000;
  const SOCIAL = 1_000_000;
  const SEO = 2_500_000;

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

    await issueTaxInvoice(tx, payment(3_138_800), source([line("managed-website", WEBSITE, 90_000), line("digital-growth", SOCIAL, 300_000), line("local-seo-aeo", SEO, 750_000)]));

    expect(inserted().lines.map((l) => [l.description, l.unitAmountCents, l.discountAmountCents, l.note])).toEqual([
      ["Managed Website", 300_000, 90_000, "Package offer, 30% off"],
      ["Social Media and Ads", 1_000_000, 300_000, "Package offer, 30% off"],
      ["Local SEO + AEO", 2_500_000, 750_000, "Package offer, 30% off"],
    ]);
    expect(inserted()).toMatchObject({ taxableCents: 2_660_000, cgstCents: 239_400, sgstCents: 239_400, roundOffCents: 0, totalCents: 3_138_800 });
    expect(inserted().lines.every((l) => l.detail === "Monthly subscription, 12 Oct to 11 Nov 2026")).toBe(true);
  });

  it("never mentions ad credit on the invoice", async () => {
    const { inserted } = arrangeInvoiceStore();

    await issueTaxInvoice(tx, payment(3_138_800), source([line("managed-website", WEBSITE, 90_000), line("digital-growth", SOCIAL, 300_000), line("local-seo-aeo", SEO, 750_000)]));

    expect(JSON.stringify(inserted().lines)).not.toMatch(/credit/i);
  });

  it("names the package's percentage even when a line's discount has a few paise more in it than that percentage", async () => {
    const { inserted } = arrangeInvoiceStore();
    // ₹2,999 and ₹9,999 at 20% off, the package total floored to the whole rupee: the dearest line carries 40 paise more.
    const net = 299_900 - 59_980 + (999_900 - 199_980 - 40);
    expect(net).toBe(1_039_800);

    await issueTaxInvoice(tx, payment(1_226_964), source([line("managed-website", 299_900, 59_980), line("digital-growth", 999_900, 199_980 + 40)]));

    expect(inserted().lines.map((l) => l.note)).toEqual(["Package offer, 20% off", "Package offer, 20% off"]);
    expect(inserted()).toMatchObject({ taxableCents: 1_039_800, totalCents: 1_226_964, roundOffCents: 0 });
  });

  it("gives a single service no discount and no note", async () => {
    const { inserted } = arrangeInvoiceStore();

    await issueTaxInvoice(tx, payment(1_180_000), source([line("digital-growth", SOCIAL, 0)]));

    expect(inserted().lines).toHaveLength(1);
    expect(inserted().lines[0]).toMatchObject({ description: "Social Media and Ads", discountAmountCents: 0, note: null });
    expect(inserted().totalCents).toBe(1_180_000);
  });

  it("leaves a service whose package offer has ended at list, with no note", async () => {
    const { inserted } = arrangeInvoiceStore();

    await issueTaxInvoice(tx, payment(1_534_000), source([line("managed-website", WEBSITE, 0), line("digital-growth", SOCIAL, 0)]));

    expect(inserted().lines.map((l) => [l.discountAmountCents, l.note])).toEqual([
      [0, null],
      [0, null],
    ]);
  });

  it("refuses a package discount on a set of services that earns no package", async () => {
    arrangeInvoiceStore();

    await expect(issueTaxInvoice(tx, payment(1_121_000), source([line("digital-growth", SOCIAL, 50_000)]))).rejects.toThrow(/earn no package offer/);
    expect(db.insertTaxInvoice).not.toHaveBeenCalled();
  });

  it("refuses a line that is not a catalogue service, as before", async () => {
    arrangeInvoiceStore();

    await expect(issueTaxInvoice(tx, payment(1_180_000), source([line("press-release", SOCIAL, 0)]))).rejects.toThrow("not a monthly add-on");
  });
});
