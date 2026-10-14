import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import type { ReceiptDocument } from "@/lib/billing/receipt-document";
import { BRANDS } from "@/lib/brand";
import { renderReceiptsPdf } from "./receipt-pdf";

vi.mock("server-only", () => ({}));

function doc(overrides: Partial<ReceiptDocument> = {}): ReceiptDocument {
  return {
    fileName: "firstfold-receipt-007.pdf",
    title: "Receipt #007",
    issuedOn: "12 Sep 2026",
    status: "Paid",
    reference: "pay_abc123",
    from: ["Firstfold", "Office No. 2617, 26th Floor, Solus Building,", "GSTIN 27AAICD9268J1Z0"],
    billedTo: ["Chennai Cafe", "owner@chennaicafe.in"],
    lines: [
      { label: "Care plan · Monthly payment", amount: "INR 2,999.00" },
      { label: "GST 18%", amount: "INR 539.82" },
    ],
    total: { label: "Total paid", amount: "INR 3,538.82" },
    note: "This is a receipt for a payment already made.",
    ...overrides,
  };
}

function header(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.slice(0, 5));
}

describe("renderReceiptsPdf", () => {
  it("makes a PDF with one page per receipt", async () => {
    const bytes = await renderReceiptsPdf([doc(), doc({ title: "Receipt #008" })]);

    expect(header(bytes)).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(2);
    expect(loaded.getTitle()).toBe("Firstfold receipts");
  });

  it("titles a single receipt after itself", async () => {
    const loaded = await PDFDocument.load(await renderReceiptsPdf([doc()]));
    expect(loaded.getTitle()).toBe("Firstfold Receipt #007");
  });

  it("still renders text the built-in font cannot draw", async () => {
    const bytes = await renderReceiptsPdf([
      doc({ billedTo: ["चेन्नई कैफ़े 🍵", "owner@chennaicafe.in"], lines: [{ label: "₹ plan", amount: "INR 1.00" }] }),
    ]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("wraps a very long business name instead of running off the page", async () => {
    const bytes = await renderReceiptsPdf([doc({ billedTo: ["A".repeat(300), "x@example.com"] })]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("refuses to make an empty PDF", async () => {
    await expect(renderReceiptsPdf([])).rejects.toThrow(RangeError);
  });
});

describe("renderReceiptsPdf under Fynix", () => {
  it("files itself under Fynix's name, not Firstfold's", async () => {
    const loaded = await PDFDocument.load(await renderReceiptsPdf([doc(), doc({ title: "Receipt #008" })], BRANDS.fynix));
    expect(loaded.getTitle()).toBe("Fynix Digital receipts");
    expect(loaded.getAuthor()).toBe("Fynix Digital");
    expect(loaded.getCreator()).toBe("Fynix Digital");
    const single = await PDFDocument.load(await renderReceiptsPdf([doc()], BRANDS.fynix));
    expect(single.getTitle()).toBe("Fynix Digital Receipt #007");
  });
});
