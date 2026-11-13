import { describe, expect, it } from "vitest";
import { adsView, campaignRows, campaignsByPlatform, campaignsUpdatedAt, type CampaignSource } from "@/lib/social/ads";

const updatedAt = new Date("2026-11-03T10:00:00Z");
const snap = { adSpendCents: null, adBudgetCents: null, adEnquiries: null, updatedAt };

describe("adsView", () => {
  it("shows spend against the budget, the share spent, leads and cost per lead", () => {
    expect(adsView({ ...snap, adSpendCents: 624_000, adBudgetCents: 1_000_000, adEnquiries: 12 }, "INR")).toEqual({
      spent: "₹6,240",
      budget: "₹10,000",
      percent: 62,
      leads: 12,
      costPerLead: "₹520",
      updatedAt,
    });
  });

  it("is null when there is no row or nothing was entered", () => {
    expect(adsView(null, "INR")).toBeNull();
    expect(adsView(snap, "INR")).toBeNull();
  });

  it("has no percent without a budget and no cost per lead without a spend", () => {
    const noBudget = adsView({ ...snap, adSpendCents: 100_000, adBudgetCents: 0, adEnquiries: 2 }, "INR");
    expect(noBudget).toMatchObject({ spent: "₹1,000", budget: null, percent: null, costPerLead: "₹500" });
    expect(adsView({ ...snap, adBudgetCents: 500_000, adEnquiries: 3 }, "INR")).toMatchObject({ spent: null, percent: null, costPerLead: null, leads: 3 });
  });

  it("keeps a measured zero for leads and gives no cost per lead", () => {
    expect(adsView({ ...snap, adSpendCents: 100_000, adEnquiries: 0 }, "INR")).toMatchObject({ leads: 0, costPerLead: null });
  });

  it("caps the percent at 100", () => {
    expect(adsView({ ...snap, adSpendCents: 2_000_000, adBudgetCents: 1_000_000 }, "INR")?.percent).toBe(100);
  });
});

const campaign = (over: Partial<CampaignSource>): CampaignSource => ({ id: "a", name: "Diwali", platform: "meta", spendCents: 300_000, budgetCents: null, leads: null, updatedAt, ...over });

describe("campaignRows", () => {
  it("sorts by name and works out cost per lead only with leads above zero", () => {
    const rows = campaignRows(
      [campaign({ id: "2", name: "Winter", platform: "google", leads: 0 }), campaign({ id: "1", name: "Diwali", budgetCents: 500_000, leads: 6 })],
      "INR",
    );
    expect(rows.map((row) => row.name)).toEqual(["Diwali", "Winter"]);
    expect(rows[0]).toMatchObject({ platform: "Meta", spent: "₹3,000", budget: "₹5,000", leads: 6, costPerLead: "₹500" });
    expect(rows[1]).toMatchObject({ platform: "Google", budget: null, leads: 0, costPerLead: null });
  });

  it("leaves leads null when staff did not enter them", () => {
    expect(campaignRows([campaign({})], "INR")[0]).toMatchObject({ leads: null, costPerLead: null });
  });
});

describe("campaignsByPlatform and campaignsUpdatedAt", () => {
  const rows = campaignRows([campaign({ id: "1", name: "B", platform: "meta" }), campaign({ id: "2", name: "A", platform: "google" }), campaign({ id: "3", name: "C", platform: "meta", updatedAt: new Date("2026-11-09T00:00:00Z") })], "INR");

  it("groups by platform keeping name order inside each group", () => {
    expect(campaignsByPlatform(rows).map((group) => [group.platform, group.rows.map((row) => row.name)])).toEqual([["Google", ["A"]], ["Meta", ["B", "C"]]]);
    expect(campaignsByPlatform([])).toEqual([]);
  });

  it("finds the latest update, or null for none", () => {
    expect(campaignsUpdatedAt(rows)).toEqual(new Date("2026-11-09T00:00:00Z"));
    expect(campaignsUpdatedAt([])).toBeNull();
  });
});
