import { describe, expect, it } from "vitest";
import { parseCampaignForm, parseCampaignMonth } from "@/lib/ad-campaign-form";

const FULL = { name: "  Full body checkup, Dadar ", platform: "meta", objective: "Leads", spendRupees: "4,120", budgetRupees: "5000", impressions: "18,000", clicks: "320", leads: "9" };

describe("parseCampaignForm", () => {
  it("trims the text, turns rupees into paise and reads the counts", () => {
    expect(parseCampaignForm(FULL)).toEqual({
      success: true,
      data: { name: "Full body checkup, Dadar", platform: "meta", objective: "Leads", spendCents: 412000, budgetCents: 500000, impressions: 18000, clicks: 320, leads: 9 },
    });
  });

  it("keeps a blank optional box as null, never zero, and accepts a spend of zero", () => {
    expect(parseCampaignForm({ ...FULL, spendRupees: "0", budgetRupees: "", impressions: "", clicks: "", leads: "" })).toMatchObject({
      success: true,
      data: { spendCents: 0, budgetCents: null, impressions: null, clicks: null, leads: null },
    });
  });

  it("needs a name, a place it ran, what it is for and the spend", () => {
    expect(parseCampaignForm({ ...FULL, name: "   " })).toMatchObject({ success: false, field: "name" });
    expect(parseCampaignForm({ ...FULL, platform: "tiktok" })).toMatchObject({ success: false, field: "platform" });
    expect(parseCampaignForm({ ...FULL, objective: "" })).toMatchObject({ success: false, field: "objective" });
    expect(parseCampaignForm({ ...FULL, spendRupees: "" })).toEqual({ success: false, field: "spendRupees", message: "Enter what it spent." });
  });

  it("refuses decimals, negatives and text, and caps the figures so the database columns cannot overflow", () => {
    expect(parseCampaignForm({ ...FULL, spendRupees: "41.5" })).toMatchObject({ success: false, field: "spendRupees" });
    expect(parseCampaignForm({ ...FULL, leads: "-1" })).toMatchObject({ success: false, field: "leads" });
    expect(parseCampaignForm({ ...FULL, clicks: "many" })).toMatchObject({ success: false, field: "clicks", message: "Use whole numbers only." });
    expect(parseCampaignForm({ ...FULL, spendRupees: "10000001" })).toEqual({ success: false, field: "spendRupees", message: "Enter 10,000,000 or less." });
    expect(parseCampaignForm({ ...FULL, impressions: "1000001" })).toEqual({ success: false, field: "impressions", message: "Enter 1,000,000 or less." });
    expect(parseCampaignForm({ ...FULL, name: "x".repeat(121) })).toMatchObject({ success: false, field: "name" });
  });
});

describe("parseCampaignMonth", () => {
  const NOW = new Date("2026-11-15T10:00:00Z");
  it("gives the first of the month for this month or an earlier one", () => {
    expect(parseCampaignMonth("2026-11", NOW)).toBe("2026-11-01");
    expect(parseCampaignMonth("2026-05", NOW)).toBe("2026-05-01");
  });
  it("refuses a later month, a bad month and text", () => {
    expect(parseCampaignMonth("2026-12", NOW)).toBeNull();
    expect(parseCampaignMonth("2026-13", NOW)).toBeNull();
    expect(parseCampaignMonth("", NOW)).toBeNull();
  });
  it("uses India time at a month boundary", () => {
    expect(parseCampaignMonth("2026-12", new Date("2026-11-30T19:00:00Z"))).toBe("2026-12-01");
  });
});
