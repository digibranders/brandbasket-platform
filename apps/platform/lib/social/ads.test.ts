import { describe, expect, it } from "vitest";
import { adsPanel } from "@/lib/social/ads";
import type { SnapshotView } from "@/lib/overview";

const blank: SnapshotView = {
  adSpendCents: null,
  adBudgetCents: null,
  adEnquiries: null,
  postsPublished: null,
  postsPlanned: null,
  keywordsPageOne: null,
  keywordsPageOnePrev: null,
};

describe("adsPanel", () => {
  it("shows spend against the budget, the share spent, enquiries and the ad money", () => {
    const panel = adsPanel({ snapshot: { ...blank, adSpendCents: 624_000, adBudgetCents: 1_000_000, adEnquiries: 14 }, adCreditCents: 150_000 });
    expect(panel).toEqual({ spent: "₹6,240 of ₹10,000", percent: 62, enquiries: 14, adMoney: "₹1,500" });
  });

  it("shows the spend alone, with no percent, when there is no budget", () => {
    expect(adsPanel({ snapshot: { ...blank, adSpendCents: 624_000 }, adCreditCents: 0 })).toEqual({ spent: "₹6,240", percent: null, enquiries: null, adMoney: null });
  });

  it("has no spend line and no percent when the spend was not measured", () => {
    expect(adsPanel({ snapshot: { ...blank, adBudgetCents: 1_000_000, adEnquiries: 3 }, adCreditCents: 0 })).toEqual({ spent: null, percent: null, enquiries: 3, adMoney: null });
  });

  it("keeps a measured zero for enquiries", () => {
    expect(adsPanel({ snapshot: { ...blank, adEnquiries: 0 }, adCreditCents: 0 })?.enquiries).toBe(0);
  });

  it("caps the percent at 100 and does not divide by a zero budget", () => {
    expect(adsPanel({ snapshot: { ...blank, adSpendCents: 1_200_000, adBudgetCents: 1_000_000 }, adCreditCents: 0 })?.percent).toBe(100);
    expect(adsPanel({ snapshot: { ...blank, adSpendCents: 0, adBudgetCents: 1_000_000 }, adCreditCents: 0 })?.percent).toBe(0);
    expect(adsPanel({ snapshot: { ...blank, adSpendCents: 100, adBudgetCents: 0 }, adCreditCents: 0 })?.percent).toBeNull();
  });

  it("hides the ad money line when the credit is 0, and shows it when it is the only figure", () => {
    expect(adsPanel({ snapshot: blank, adCreditCents: 0 })).toBeNull();
    expect(adsPanel({ snapshot: null, adCreditCents: 300_000 })).toEqual({ spent: null, percent: null, enquiries: null, adMoney: "₹3,000" });
  });

  it("returns null when nothing is known, never a panel of zeros", () => {
    expect(adsPanel({ snapshot: null, adCreditCents: 0 })).toBeNull();
  });
});
