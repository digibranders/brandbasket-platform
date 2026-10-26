import { describe, expect, it } from "vitest";
import { parseNumbersForm } from "@/lib/numbers-form";

const SOCIAL = { service: "social", month: "2026-11", adSpendRupees: "6,240", adBudgetRupees: "10000", adEnquiries: "21", postsPublished: "12", postsPlanned: "14", keywordsPageOne: "", keywordsPageOnePrev: "" };

describe("parseNumbersForm", () => {
  it("reads the ads figures, turns rupees into paise and ignores the search fields", () => {
    expect(parseNumbersForm({ ...SOCIAL, keywordsPageOne: "9" })).toEqual({
      success: true,
      data: {
        service: "social",
        month: "2026-11-01",
        figures: { adSpendCents: 624000, adBudgetCents: 1000000, adEnquiries: 21, postsPublished: 12, postsPlanned: 14, keywordsPageOne: null, keywordsPageOnePrev: null },
      },
    });
  });

  it("reads the search figures and ignores the ads fields", () => {
    expect(parseNumbersForm({ ...SOCIAL, service: "search", keywordsPageOne: "9", keywordsPageOnePrev: "6" })).toEqual({
      success: true,
      data: {
        service: "search",
        month: "2026-11-01",
        figures: { adSpendCents: null, adBudgetCents: null, adEnquiries: null, postsPublished: null, postsPlanned: null, keywordsPageOne: 9, keywordsPageOnePrev: 6 },
      },
    });
  });

  it("needs at least one figure", () => {
    expect(parseNumbersForm({ ...SOCIAL, adSpendRupees: "", adBudgetRupees: "", adEnquiries: "", postsPublished: "", postsPlanned: "" })).toEqual({
      success: false,
      field: "adSpendRupees",
      message: "Enter at least one number.",
    });
  });

  it("refuses a bad month, an unknown service and a figure that is not a whole number", () => {
    expect(parseNumbersForm({ ...SOCIAL, month: "2026-13" })).toMatchObject({ success: false, field: "month" });
    expect(parseNumbersForm({ ...SOCIAL, service: "website" })).toMatchObject({ success: false, field: "service" });
    expect(parseNumbersForm({ ...SOCIAL, adEnquiries: "twenty" })).toMatchObject({ success: false, field: "adEnquiries" });
    expect(parseNumbersForm({ ...SOCIAL, postsPublished: "-1" })).toMatchObject({ success: false, field: "postsPublished" });
  });

  it("caps rupees at 10,000,000 and counts at 1,000,000 so the database columns cannot overflow", () => {
    expect(parseNumbersForm({ ...SOCIAL, adSpendRupees: "999999999" })).toEqual({ success: false, field: "adSpendRupees", message: "Enter 10,000,000 or less." });
    expect(parseNumbersForm({ ...SOCIAL, adBudgetRupees: "10000001" })).toMatchObject({ success: false, field: "adBudgetRupees", message: "Enter 10,000,000 or less." });
    expect(parseNumbersForm({ ...SOCIAL, adSpendRupees: "10,000,000" })).toMatchObject({ success: true, data: { figures: { adSpendCents: 1_000_000_000 } } });
    expect(parseNumbersForm({ ...SOCIAL, adEnquiries: "1000001" })).toEqual({ success: false, field: "adEnquiries", message: "Enter 1,000,000 or less." });
    expect(parseNumbersForm({ ...SOCIAL, service: "search", keywordsPageOnePrev: "1000001" })).toMatchObject({ success: false, field: "keywordsPageOnePrev" });
  });

  it("does not glue digits together across spaces or a rupee sign", () => {
    expect(parseNumbersForm({ ...SOCIAL, adSpendRupees: "1 2" })).toEqual({ success: false, field: "adSpendRupees", message: "Use whole numbers only." });
    expect(parseNumbersForm({ ...SOCIAL, adSpendRupees: "1₹2" })).toMatchObject({ success: false, field: "adSpendRupees" });
    expect(parseNumbersForm({ ...SOCIAL, adSpendRupees: "1,,2" })).toMatchObject({ success: false, field: "adSpendRupees" });
    expect(parseNumbersForm({ ...SOCIAL, adSpendRupees: ",12" })).toMatchObject({ success: false, field: "adSpendRupees" });
    expect(parseNumbersForm({ ...SOCIAL, adSpendRupees: "₹ 6,240" })).toMatchObject({ success: true, data: { figures: { adSpendCents: 624000 } } });
  });
});
