import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import type { TaxInvoice, TaxInvoiceLineRecord } from "@brandbasket/db";
import { recipientPhoneToPrint, renderTaxInvoicesPdf } from "./tax-invoice-pdf";

vi.mock("server-only", () => ({}));

const line: TaxInvoiceLineRecord = {
  description: "Fynix Premium plan",
  detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
  note: "Coupon GAURAV applied, 20% off",
  sac: "998361",
  quantity: 1,
  unitAmountCents: 699_900,
  grossAmountCents: 699_900,
  discountAmountCents: 139_980,
  taxableCents: 559_920,
  taxRateBasisPoints: 1_800,
  cgstCents: 50_393,
  sgstCents: 50_393,
  igstCents: 0,
  taxCents: 100_786,
};

const invoice: TaxInvoice = {
  id: "01920000-0000-7000-8000-000000000001",
  businessId: "01920000-0000-7000-8000-0000000000b1",
  paymentId: "01920000-0000-7000-8000-0000000000a1",
  prefix: "FY",
  financialYear: "26-27",
  serial: 1,
  number: "FY/26-27/000001",
  issuedOn: "2026-10-09",
  paidOn: "2026-10-09",
  supplier: {
    legalName: "Digibranders Private Limited",
    tradeName: "Fynix",
    gstin: "27AAICD9268J1Z0",
    cin: "U72900MH2021PTC372344",
    addressLines: ["Office No. 2617, 26th Floor, Solus Building,", "Hiranandani Estate, Ghodbunder Road,", "Thane West, Maharashtra 400607, India"],
    stateCode: "mh",
    email: "support@fynix.io",
    phone: "+91 789 789 6607",
  },
  recipient: {
    legalName: "QA Premium Business",
    tradeName: null,
    gstin: "27AAPFU0939F1ZV",
    cin: null,
    addressLines: ["Shop 4, Gokul Arcade, LBS Marg,", "Mulund West, Mumbai 400080"],
    stateCode: "mh",
    email: null,
    phone: null,
  },
  placeOfSupplyStateCode: "mh",
  placeOfSupplyBasis: "gstin",
  supplyType: "intra_state",
  lines: [line],
  taxableCents: 559_920,
  cgstCents: 50_393,
  sgstCents: 50_393,
  igstCents: 0,
  roundOffCents: 0,
  totalCents: 660_706,
  paymentLabel: "Visa credit card ending 4366",
  paymentReference: "pay_TljxffN6THodkg",
  createdAt: new Date("2026-10-09T06:00:00Z"),
};

async function pages(invoices: readonly TaxInvoice[]): Promise<PDFDocument> {
  return PDFDocument.load(await renderTaxInvoicesPdf(invoices));
}

describe("renderTaxInvoicesPdf", () => {
  it("draws each invoice on its own A4 page", async () => {
    const pdf = await pages([invoice, { ...invoice, serial: 2, number: "FY/26-27/000002" }]);
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
    expect(pdf.getTitle()).toBe("Fynix Digital tax invoices");
    expect(pdf.getCreator()).toBe("Fynix Digital");
  });

  it("names a single invoice in the document title", async () => {
    expect((await pages([invoice])).getTitle()).toBe("Tax invoice FY/26-27/000001");
  });

  it("links the supplier's email, the footer's email and the website", async () => {
    const pdf = await pages([invoice]);
    expect(pdf.getPage(0).node.Annots()?.size()).toBe(3);
  });

  it("prints a name the font cannot draw, a staff-issued date and a long bank reference without failing", async () => {
    const pdf = await pages([
      {
        ...invoice,
        recipient: { ...invoice.recipient, legalName: "क्यूए प्रीमियम Clinic", gstin: null },
        placeOfSupplyBasis: "billing_address",
        paidOn: "2026-09-30",
        paymentLabel: "Bank transfer, reference NEFT 0921 HDFC0000123 UTR 4419920019 for September and October",
      },
    ]);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("keeps one line on one page with a long name, long address lines and a long payment reference", async () => {
    const long = "Sri Venkateswara Multispeciality Dental and Orthodontic Clinic and Research Centre Private Limited";
    const pdf = await pages([
      {
        ...invoice,
        recipient: { ...invoice.recipient, legalName: long, addressLines: ["A".repeat(120), `${long} ${long}`] },
        paymentReference: `pay_${"X".repeat(60)}`,
      },
    ]);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("draws an other-state invoice with a round off row on one page", async () => {
    const pdf = await pages([
      {
        ...invoice,
        supplyType: "inter_state",
        placeOfSupplyStateCode: "ka",
        cgstCents: 0,
        sgstCents: 0,
        igstCents: 100_786,
        roundOffCents: 1,
        totalCents: 660_707,
        lines: [{ ...line, cgstCents: 0, sgstCents: 0, igstCents: 100_786 }],
      },
    ]);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("carries lines that do not fit on to a continuation page of the same invoice", async () => {
    const long = "Sri Venkateswara Multispeciality Dental and Orthodontic Clinic and Research Centre Private Limited";
    const pdf = await pages([{ ...invoice, lines: Array.from({ length: 8 }, () => ({ ...line, description: long, note: "Coupon GAURAV applied, 20% off. Stay offer applied" })) }]);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("refuses to render nothing", async () => {
    await expect(renderTaxInvoicesPdf([])).rejects.toThrow(RangeError);
  });
});

describe("recipientPhoneToPrint", () => {
  const bare = { ...invoice.recipient, legalName: "Gaurav", gstin: null, addressLines: [], stateCode: null };

  it("prints the account's mobile when the invoice has nothing else to say who it is to", () => {
    expect(recipientPhoneToPrint(bare, "+91 90000 00002")).toBe("+91 90000 00002");
  });

  it("prints nothing when no mobile is known", () => {
    expect(recipientPhoneToPrint(bare, null)).toBeNull();
    expect(recipientPhoneToPrint(bare, undefined)).toBeNull();
    expect(recipientPhoneToPrint(bare, "   ")).toBeNull();
  });

  it("leaves an invoice with an address or a GSTIN to its own details", () => {
    expect(recipientPhoneToPrint({ ...bare, addressLines: ["Mulund West, Mumbai 400080"] }, "+91 90000 00002")).toBeNull();
    expect(recipientPhoneToPrint({ ...bare, gstin: "27AAPFU0939F1ZV" }, "+91 90000 00002")).toBeNull();
  });
});

describe("renderTaxInvoicesPdf with the customer's mobile", () => {
  const unregistered: TaxInvoice = {
    ...invoice,
    recipient: { ...invoice.recipient, legalName: "Gaurav", gstin: null, addressLines: [], stateCode: null },
    placeOfSupplyBasis: "supplier_location",
  };

  it("still draws the invoice on one page with a mobile under Billed to", async () => {
    const doc = await PDFDocument.load(await renderTaxInvoicesPdf([unregistered], { recipientPhone: "+91 90000 00002" }));
    expect(doc.getPageCount()).toBe(1);
  });

  it("draws the same page count with no options, as before", async () => {
    expect((await pages([unregistered])).getPageCount()).toBe(1);
  });
});

describe("renderTaxInvoicesPdf with a letterhead and contact line of its own", () => {
  const letterhead = { paths: ["M0 0L10 0L10 10L0 10Z"], height: 10, colorHex: "#0C1E2E" } as const;
  const contact = { email: "hello@fynix.digital", website: "https://fynix.digital" } as const;

  it("draws the given letterhead and contact line, still on one page", async () => {
    const bytes = await renderTaxInvoicesPdf([invoice], { brandName: "Fynix Digital", letterhead, contact });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getCreator()).toBe("Fynix Digital");
    expect(pdf.getTitle()).toBe("Tax invoice FY/26-27/000001");
  });

  it("links the given address and site in the footer", async () => {
    const pdf = await PDFDocument.load(await renderTaxInvoicesPdf([invoice], { letterhead, contact: { email: "billing@example.test", website: "https://example.test" } }));
    const uris = (pdf.getPage(0).node.Annots()?.asArray() ?? []).flatMap((ref) => {
      const annotation = pdf.context.lookup(ref, PDFDict);
      const action = annotation.lookup(PDFName.of("A"), PDFDict);
      const uri = action.lookup(PDFName.of("URI"), PDFString);
      return [uri.decodeText()];
    });
    expect(uris).toContain("mailto:billing@example.test");
    expect(uris).toContain("https://example.test");
  });

  it("refuses a letterhead colour that is not #rrggbb", async () => {
    await expect(renderTaxInvoicesPdf([invoice], { letterhead: { ...letterhead, colorHex: "navy" } })).rejects.toThrow(RangeError);
  });
});
