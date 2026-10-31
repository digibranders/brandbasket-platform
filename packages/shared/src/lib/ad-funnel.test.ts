import { describe, expect, it } from "vitest";
import { buildAdFunnel, parseAdsMessage } from "./ad-funnel";

describe("parseAdsMessage", () => {
  it("reads the campaign words out of the line the /start form leaves on the lead, lower case", () => {
    expect(parseAdsMessage("Ad landing page. Going to payment. utm_source=Meta, utm_medium=paid_social, utm_campaign=Diwali, utm_content=Ad1, fbclid=IwAR0")).toEqual({
      source: "meta", medium: "paid_social", campaign: "diwali", content: "ad1",
    });
  });

  it("calls what is missing (none) and ignores a message that is not from the ad page", () => {
    expect(parseAdsMessage("Ad landing page. Going to payment.")).toEqual({ source: "(none)", medium: "(none)", campaign: "(none)", content: "(none)" });
    expect(parseAdsMessage("Hello, I would like a website")).toBeNull();
    expect(parseAdsMessage(null)).toBeNull();
  });
});

const account = (businessId: string, campaign: string | null, source: string | null = "meta") => ({ businessId, utmSource: source, utmMedium: "paid_social", utmCampaign: campaign, utmContent: null });

describe("buildAdFunnel", () => {
  it("counts leads, accounts, paid customers and money for each campaign", () => {
    const rows = buildAdFunnel({
      leads: [
        { message: "Ad landing page. Going to payment. utm_source=meta, utm_medium=paid_social, utm_campaign=Diwali" },
        { message: "Ad landing page. Going to payment. utm_source=meta, utm_medium=paid_social, utm_campaign=diwali" },
        { message: "Ad landing page. Going to payment. utm_source=google, utm_medium=cpc, utm_campaign=search" },
        { message: "Hello, I would like a website" },
      ],
      accounts: [account("b1", "Diwali"), account("b2", "diwali"), account("b3", "search", "google")],
      firstPayments: [
        { businessId: "b1", currency: "INR", amountCents: 299900, gstCents: 45746 },
        { businessId: "b3", currency: "USD", amountCents: 6500, gstCents: null },
      ],
    });
    expect(rows).toEqual([
      { source: "meta", medium: "paid_social", campaign: "diwali", content: "(none)", leads: 2, accounts: 2, paid: 1, revenueInrCents: 254154, revenueUsdCents: 0 },
      { source: "google", medium: "paid_social", campaign: "search", content: "(none)", leads: 0, accounts: 1, paid: 1, revenueInrCents: 0, revenueUsdCents: 6500 },
      { source: "google", medium: "cpc", campaign: "search", content: "(none)", leads: 1, accounts: 0, paid: 0, revenueInrCents: 0, revenueUsdCents: 0 },
    ]);
  });

  it("counts a business that paid once however many payments it lists, and a business with no attribution not at all", () => {
    const rows = buildAdFunnel({
      leads: [],
      accounts: [account("b1", "diwali")],
      firstPayments: [
        { businessId: "b1", currency: "INR", amountCents: 11800, gstCents: null },
        { businessId: "b1", currency: "INR", amountCents: 99900, gstCents: null },
        { businessId: "b9", currency: "INR", amountCents: 11800, gstCents: null },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accounts: 1, paid: 1, revenueInrCents: 10000 });
  });

  it("is empty when there is nothing", () => {
    expect(buildAdFunnel({ leads: [], accounts: [], firstPayments: [] })).toEqual([]);
  });
});
