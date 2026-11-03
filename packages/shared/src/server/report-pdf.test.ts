import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { renderReportPdf, type ReportPdfInput } from "./report-pdf";

vi.mock("server-only", () => ({}));

const INPUT: ReportPdfInput = {
  businessName: "Kulkarni Physio & Wellness",
  serviceTitle: "Social & Ads",
  monthTitle: "October 2026",
  sentOn: "4 November 2026",
  content: {
    headline: "We published 9 posts for you in October. Your ads brought 18 enquiries.",
    figures: [
      { label: "Posts published in October", value: "9 of 12 planned" },
      { label: "Ad spend in October", value: "₹4,500" },
      { label: "Cost of one ad enquiry", value: "₹250" },
    ],
    whatWeDid: ["5 Oct 2026: Published a post: Diwali offer"],
  },
};

describe("renderReportPdf", () => {
  it("makes one A4 page that opens as a PDF, with the rupee sign drawn", async () => {
    const bytes = await renderReportPdf(INPUT);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Social & Ads report, October 2026 for Kulkarni Physio & Wellness");
  });

  it("flows a long list of work onto further pages", async () => {
    const whatWeDid = Array.from({ length: 20 }, (_, index) => `${index + 1} Oct 2026: ${"Improved the page about physiotherapy for back pain ".repeat(3)}`);
    const doc = await PDFDocument.load(await renderReportPdf({ ...INPUT, content: { ...INPUT.content, whatWeDid } }));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("prints a character the font lacks as a question mark instead of failing", async () => {
    await expect(renderReportPdf({ ...INPUT, businessName: "श्री साई 🙂 Clinic" })).resolves.toBeInstanceOf(Uint8Array);
  });
});
