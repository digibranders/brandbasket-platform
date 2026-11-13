import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AdsView } from "@/components/ads/ads-view";
import type { AdsData } from "@/lib/server/ads";
import { adsView, campaignRows } from "@/lib/social/ads";

const updatedAt = new Date("2026-11-03T10:00:00Z");
const render = (data: AdsData): string => renderToStaticMarkup(createElement(AdsView, { data })).replaceAll("<!-- -->", "");
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const filled: AdsData = {
  month: "November",
  unavailable: false,
  ads: adsView({ adSpendCents: 624_000, adBudgetCents: 1_000_000, adEnquiries: 12, updatedAt }, "INR"),
  campaigns: campaignRows(
    [
      { id: "1", name: "Diwali offer", platform: "meta", spendCents: 300_000, budgetCents: 500_000, leads: 6, updatedAt },
      { id: "2", name: "Search", platform: "google", spendCents: 100_000, budgetCents: null, leads: null, updatedAt },
    ],
    "INR",
  ),
};

it("sits in the page frame with the title Ads", () => {
  const html = render(filled);
  expect(html).toContain(">Ads</h1>");
  expect(html).toContain("@container");
});

it("shows the real figures: spend against budget, leads, cost per lead and campaigns by platform", () => {
  const out = text(render(filled));
  for (const part of ["Ads in November", "₹6,240 of ₹10,000", "12", "₹520", "Google", "Meta", "Diwali offer", "₹3,000 of ₹5,000 spent, 6 leads, ₹500 per lead", "leads not measured yet"]) expect(out).toContain(part);
  expect(out.indexOf("Google")).toBeLessThan(out.indexOf("Meta"));
});

it("says plainly that figures appear after the first campaign, with no sample numbers", () => {
  const out = text(render({ month: "November", ads: null, campaigns: [], unavailable: false }));
  expect(out).toContain("Your figures appear here once your first campaign has run.");
  expect(out).not.toContain("Sample");
  expect(out).not.toMatch(/₹\d/);
});

it("says the figures could not be loaded instead of claiming there are none", () => {
  const out = text(render({ month: "November", ads: null, campaigns: [], unavailable: true }));
  expect(out).toContain("We could not load your ad figures");
  expect(out).not.toContain("first campaign");
});

it("has no button and no form, and never uses a dash in what it says", () => {
  const html = render(filled);
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<form");
  expect(text(html)).not.toMatch(/[–—]/);
});
