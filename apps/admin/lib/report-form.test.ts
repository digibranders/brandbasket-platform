import { describe, expect, it } from "vitest";
import { parseReportForm } from "@/lib/report-form";

const NOW = new Date("2026-10-27T10:00:00Z");
const FIELDS = { service: "social", month: "2026-10", url: "https://example.com/report.pdf" };

describe("parseReportForm", () => {
  it("reads a report and stores the month as its first day", () => {
    expect(parseReportForm(FIELDS, NOW)).toEqual({ success: true, data: { service: "social", month: "2026-10-01", url: "https://example.com/report.pdf" } });
    expect(parseReportForm({ ...FIELDS, service: "search", month: "2026-01" }, NOW)).toMatchObject({ success: true, data: { service: "search", month: "2026-01-01" } });
  });

  it("refuses another service, a bad month and a month in the future", () => {
    expect(parseReportForm({ ...FIELDS, service: "website" }, NOW)).toMatchObject({ success: false });
    expect(parseReportForm({ ...FIELDS, month: "2026-13" }, NOW)).toMatchObject({ success: false });
    expect(parseReportForm({ ...FIELDS, month: "2026-11" }, NOW)).toMatchObject({ success: false });
  });

  it("takes an https address up to 500 characters", () => {
    expect(parseReportForm({ ...FIELDS, url: "" }, NOW)).toMatchObject({ success: false });
    expect(parseReportForm({ ...FIELDS, url: "http://example.com/r" }, NOW)).toMatchObject({ success: false });
    expect(parseReportForm({ ...FIELDS, url: `https://example.com/${"x".repeat(481)}` }, NOW)).toMatchObject({ success: false });
  });
});
