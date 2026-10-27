import { describe, expect, it } from "vitest";
import { boughtRows, type BoughtLine } from "@/lib/website/bought";

const line = (patch: Partial<BoughtLine>): BoughtLine => ({ addOn: "managed-website", status: "active", activatedAt: new Date("2026-10-27T06:00:00Z"), endRequestedAt: null, ...patch });

describe("boughtRows", () => {
  it("names each service the plan pays for, with the day it started, in the catalogue's order", () => {
    const rows = boughtRows([line({ addOn: "local-seo-aeo" }), line({ addOn: "managed-website" }), line({ addOn: "digital-growth", activatedAt: new Date("2026-11-03T06:00:00Z") })]);
    expect(rows).toEqual([
      { key: "managed-website", name: "Managed Website", note: "Since 27 Oct" },
      { key: "digital-growth", name: "Social Media and Ads", note: "Since 3 Nov" },
      { key: "local-seo-aeo", name: "Local SEO + AEO", note: "Since 27 Oct" },
    ]);
  });

  it("says a service still to be paid for starts with the first payment", () => {
    expect(boughtRows([line({ status: "pending", activatedAt: null })])).toEqual([{ key: "managed-website", name: "Managed Website", note: "Starts with your first payment" }]);
  });

  it("says a service asked to end stops at the next bill", () => {
    expect(boughtRows([line({ endRequestedAt: new Date("2026-11-01T06:00:00Z") })])[0]?.note).toBe("Ends at your next bill");
  });

  it("leaves out lines that are not billed and ids it does not know", () => {
    expect(boughtRows([line({ status: "ended" }), line({ addOn: "something-else" })])).toEqual([]);
  });
});
