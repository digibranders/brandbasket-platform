import { chargedAmountCents } from "@brandbasket/billing/tax";
import type { PaymentInvoiceBasis, Receipt } from "@brandbasket/db";
import { addOnById, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { packageBasisPointsFor, packageDiscountsFor } from "@brandbasket/shared/lib/billing/packages";
import { BRAND } from "@/lib/brand";
import { describe, expect, it } from "vitest";
import { isDownloadableReceipt, receiptDocument, splitTax } from "./receipt-document";

const PAID_AT = new Date("2026-09-12T10:00:00.000Z");

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: "0192f3c4-0000-7000-8000-000000000001",
    businessId: "0192f3c4-1111-7000-8000-000000000001",
    subscriptionId: "0192f3c4-2222-7000-8000-000000000001",
    provider: "razorpay",
    providerPaymentId: "pay_abc123",
    kind: "renewal",
    amountCents: 353_882,
    currency: "INR",
    status: "captured",
    paidAt: PAID_AT,
    failureReason: null,
    attentionReason: null,
    attentionResolvedAt: null,
    createdAt: PAID_AT,
    initialTermMonths: 1,
    planName: "Care",
    taxRateBasisPoints: 1800,
    sequence: 7,
    chargeDescription: null,
    chargeQuantity: null,
    chargeKind: null,
    chargeCreatedAt: null,
    taxInvoiceId: null,
    taxInvoiceNumber: null,
    addOnId: null,
    invoiceBasis: null,
    ...overrides,
  };
}

const CUSTOMER = { businessName: "Chennai Cafe", email: "owner@chennaicafe.in" };

describe("splitTax", () => {
  it("takes 18% GST back out of what was charged, to the paisa", () => {
    expect(splitTax(353_882, 1800)).toEqual({ netCents: 299_900, taxCents: 53_982 });
  });

  it("leaves an untaxed amount whole", () => {
    expect(splitTax(6_900, 0)).toEqual({ netCents: 6_900, taxCents: 0 });
  });

  it("always adds back up to the amount charged", () => {
    for (const gross of [1, 99, 118, 12_345, 353_881, 1_000_001]) {
      const { netCents, taxCents } = splitTax(gross, 1800);
      expect(netCents + taxCents).toBe(gross);
    }
  });
});

describe("receiptDocument", () => {
  it("splits GST out for an Indian receipt and prints rupees as INR", () => {
    const doc = receiptDocument(receipt(), CUSTOMER);

    expect(doc).toMatchObject({
      fileName: "brandbasket-receipt-007.pdf",
      title: "Receipt #007",
      issuedOn: "12 Sep 2026",
      status: "Paid",
      reference: "pay_abc123",
      billedTo: ["Chennai Cafe", "owner@chennaicafe.in"],
      lines: [
        { label: "Care plan · Monthly payment", amount: "INR 2,999.00" },
        { label: "GST 18%", amount: "INR 539.82" },
      ],
      total: { label: "Total paid", amount: "INR 3,538.82" },
    });
    expect(doc.from).toEqual([
      "Brandbasket",
      "Digibranders Private Limited",
      "Office No. 2617, 26th Floor, Solus Building,",
      "Hiranandani Estate, Ghodbunder Road,",
      "Thane West, Maharashtra 400607, India",
      "GSTIN 27AAICD9268J1Z0",
      "CIN U72900MH2021PTC372344",
      "support@brandbasket.in",
    ]);
  });

  it("prints a dollar receipt as a single line", () => {
    const doc = receiptDocument(
      receipt({ currency: "USD", amountCents: 6_900, taxRateBasisPoints: 0, kind: "initial", sequence: 1 }),
      CUSTOMER,
    );

    expect(doc.lines).toEqual([{ label: "Care plan · First payment, covering your first month", amount: "USD 69.00" }]);
    expect(doc.total).toEqual({ label: "Total paid", amount: "USD 69.00" });
    expect(doc.fileName).toBe("brandbasket-receipt-001.pdf");
  });

  it("groups large rupee amounts the Indian way", () => {
    const doc = receiptDocument(receipt({ amountCents: 11_800_000 }), CUSTOMER);
    expect(doc.total.amount).toBe("INR 1,18,000.00");
  });

  it("says a payment we could not apply was received, and a refunded one was refunded", () => {
    expect(receiptDocument(receipt({ attentionReason: "amount_mismatch" }), CUSTOMER).status).toBe("Received");
    expect(receiptDocument(receipt({ status: "refunded" }), CUSTOMER).status).toBe("Refunded");
  });

  it("describes a payment with no plan without inventing one", () => {
    const doc = receiptDocument(
      receipt({ planName: null, taxRateBasisPoints: null, initialTermMonths: null, subscriptionId: null }),
      CUSTOMER,
    );
    expect(doc.lines).toEqual([{ label: "Monthly payment", amount: "INR 3,538.82" }]);
  });

  it("falls back to the day it was recorded when the payment date is missing", () => {
    const doc = receiptDocument(receipt({ paidAt: null, createdAt: new Date("2026-09-14T08:00:00Z") }), CUSTOMER);
    expect(doc.issuedOn).toBe("14 Sep 2026");
  });

  it("refuses a failed payment, which has nothing to receipt", () => {
    expect(() => receiptDocument(receipt({ status: "failed" }), CUSTOMER)).toThrow(/failed/);
  });
});

describe("isDownloadableReceipt", () => {
  it("offers a receipt for money that was taken, and none for a failed attempt", () => {
    expect(isDownloadableReceipt(receipt())).toBe(true);
    expect(isDownloadableReceipt(receipt({ status: "refunded" }))).toBe(true);
    expect(isDownloadableReceipt(receipt({ status: "failed" }))).toBe(false);
  });
});

describe("receiptDocument for a paid extra", () => {
  it("names the extra and splits its own GST", () => {
    const doc = receiptDocument(
      receipt({
        kind: "charge",
        subscriptionId: null,
        planName: null,
        initialTermMonths: null,
        chargeKind: "change_hours",
        chargeDescription: "Extra change hours",
        chargeQuantity: 2,
        amountCents: 336_300,
        taxRateBasisPoints: 1800,
      }),
      CUSTOMER,
    );
    expect(doc.lines).toEqual([
      { label: "Extra change hours · 2 h", amount: "INR 2,850.00" },
      { label: "GST 18%", amount: "INR 513.00" },
    ]);
    expect(doc.total.amount).toBe("INR 3,363.00");
  });
});

describe("receiptDocument for an add-on payment", () => {
  it("names the add-on and splits its GST out of what was charged", () => {
    const doc = receiptDocument(
      receipt({
        kind: "add_on",
        subscriptionId: null,
        planName: null,
        initialTermMonths: null,
        addOnId: "digital-growth",
        amountCents: 1_062_000,
        taxRateBasisPoints: 1800,
      }),
      CUSTOMER,
    );
    expect(doc.lines).toEqual([
      { label: "Social Media and Ads, monthly", amount: "INR 9,000.00" },
      { label: "GST 18%", amount: "INR 1,620.00" },
    ]);
    expect(doc.total.amount).toBe("INR 10,620.00");
  });
});

describe("receiptDocument under Brandbasket", () => {
  it("is headed with Brandbasket, files itself as Brandbasket and points questions at Brandbasket's address", () => {
    const doc = receiptDocument(receipt(), { businessName: "Chennai Cafe", email: "owner@chennaicafe.in" }, BRAND);
    expect(doc.fileName).toBe("brandbasket-receipt-007.pdf");
    expect(doc.from[0]).toBe("Brandbasket");
    expect(doc.note).toContain("support@brandbasket.in");
    expect([...doc.from, doc.note, doc.fileName].join(" ")).not.toMatch(/first\s?fold/i);
  });
});

/** "INR 1,234.50" as 123450, and "-INR 600.00" as -60000. */
function cents(amount: string): number {
  const match = /^(-?)INR ([\d,]+)\.(\d{2})$/.exec(amount);
  if (match === null) throw new Error(`Not an INR amount: ${amount}`);
  const value = Number(`${match[2]?.replaceAll(",", "")}${match[3]}`);
  return match[1] === "-" ? -value : value;
}

/** A services payment as the payment path records it: the package priced by packageDiscountsFor, a code taken off the net. */
function servicesPayment(
  services: readonly MonthlyAddOnId[],
  extras: { readonly codeCents?: number; readonly retentionCents?: number } = {},
): Receipt {
  const basisPoints = packageBasisPointsFor({ services, forfeited: false });
  const lists = services.map((addOn) => ({ addOn, listCents: addOnById(addOn).prices.INR }));
  const offers = packageDiscountsFor(lists, basisPoints);
  const discountAmountCents = (extras.codeCents ?? 0) + (extras.retentionCents ?? 0);
  const invoiceBasis: PaymentInvoiceBasis = {
    netAmountCents: 0,
    discountAmountCents,
    retentionDiscountCents: extras.retentionCents ?? 0,
    lines: lists.map((line, index) => ({
      addOn: line.addOn,
      listAmountCents: line.listCents,
      offerDiscountAmountCents: offers[index] ?? 0,
      taxRateBasisPoints: 1800,
    })),
  };
  const net = invoiceBasis.lines.reduce((sum, line) => sum + line.listAmountCents - line.offerDiscountAmountCents, 0);
  return receipt({ amountCents: chargedAmountCents(net, discountAmountCents, 1800), invoiceBasis });
}

describe("receiptDocument for services", () => {
  function rowsAddUp(doc: ReturnType<typeof receiptDocument>, paid: number): void {
    expect(doc.lines.reduce((sum, line) => sum + cents(line.amount), 0)).toBe(paid);
    expect(cents(doc.total.amount)).toBe(paid);
  }

  it("lists two services at list, the 20% package offer, GST and the total", () => {
    const paid = servicesPayment(["managed-website", "digital-growth"]);
    const doc = receiptDocument(paid, CUSTOMER);

    expect(doc.lines.map((line) => line.label)).toEqual([
      "Managed Website",
      "Social Media and Ads",
      "Package offer, 20% off",
      "GST 18%",
    ]);
    expect(doc.lines.map((line) => line.amount)).toEqual(["INR 2,999.00", "INR 9,999.00", "-INR 2,600.00", "INR 1,871.64"]);
    expect(doc.total).toEqual({ label: "Total paid", amount: "INR 12,269.64" });
    rowsAddUp(doc, paid.amountCents);
  });

  it("lists three services with the 30% package offer", () => {
    const paid = servicesPayment(["managed-website", "digital-growth", "local-seo-aeo"]);
    const doc = receiptDocument(paid, CUSTOMER);

    expect(doc.lines.map((line) => line.label)).toEqual([
      "Managed Website",
      "Social Media and Ads",
      "Local SEO + AEO",
      "Package offer, 30% off",
      "GST 18%",
    ]);
    rowsAddUp(doc, paid.amountCents);
  });

  it("names the 30% offer on the two-service package that earns it", () => {
    const paid = servicesPayment(["digital-growth", "local-seo-aeo"]);
    const doc = receiptDocument(paid, CUSTOMER);
    expect(doc.lines.map((line) => line.label)).toContain("Package offer, 30% off");
    rowsAddUp(doc, paid.amountCents);
  });

  it("has no offer row for a single service", () => {
    const paid = servicesPayment(["managed-website"]);
    const doc = receiptDocument(paid, CUSTOMER);

    expect(doc.lines).toEqual([
      { label: "Managed Website", amount: "INR 2,999.00" },
      { label: "GST 18%", amount: "INR 539.82" },
    ]);
    rowsAddUp(doc, paid.amountCents);
  });

  it("takes a code off as one figure after the package offer, and a stay offer as its own row", () => {
    const withCode = servicesPayment(["managed-website", "digital-growth"], { codeCents: 150_000 });
    const codeDoc = receiptDocument(withCode, CUSTOMER);
    expect(codeDoc.lines.map((line) => line.label)).toEqual([
      "Managed Website",
      "Social Media and Ads",
      "Package offer, 20% off",
      "Code discount",
      "GST 18%",
    ]);
    expect(codeDoc.lines[3]?.amount).toBe("-INR 1,500.00");
    rowsAddUp(codeDoc, withCode.amountCents);

    const withStay = servicesPayment(["managed-website", "digital-growth"], { codeCents: 150_000, retentionCents: 50_000 });
    const stayDoc = receiptDocument(withStay, CUSTOMER);
    expect(stayDoc.lines.map((line) => line.label)).toContain("Stay offer");
    rowsAddUp(stayDoc, withStay.amountCents);
  });

  it("keeps today's single line when the basis does not describe the payment", () => {
    const paid = servicesPayment(["managed-website", "digital-growth"]);
    const wrongAmount = receiptDocument({ ...paid, amountCents: paid.amountCents + 5_000 }, CUSTOMER);
    expect(wrongAmount.lines.map((line) => line.label)).toEqual(["Care plan · Monthly payment", "GST 18%"]);
  });

  it("keeps today's single line for a payment with no basis", () => {
    expect(receiptDocument(receipt({ invoiceBasis: null }), CUSTOMER).lines).toEqual([
      { label: "Care plan · Monthly payment", amount: "INR 2,999.00" },
      { label: "GST 18%", amount: "INR 539.82" },
    ]);
  });
});
