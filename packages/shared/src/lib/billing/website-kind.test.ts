import { describe, expect, it } from "vitest";
import { addOnById, addOnPrice, cyclePriceCents } from "./add-ons";
import { packageLines } from "./packages";
import { isWebsiteKind, websiteBuildFeeCents, websiteMonthlyCents } from "./website-kind";

describe("website kinds", () => {
  it("knows the two kinds", () => {
    expect(isWebsiteKind("b2b")).toBe(true);
    expect(isWebsiteKind("ecommerce")).toBe(true);
    expect(isWebsiteKind("shop")).toBe(false);
  });
  it("holds the owner's prices (2026-11-27), minor units, GST inside rupees", () => {
    expect(websiteMonthlyCents("b2b", "INR")).toBe(299_900);
    expect(websiteMonthlyCents("ecommerce", "INR")).toBe(399_900);
    expect(websiteMonthlyCents("b2b", "USD")).toBe(5_900);
    expect(websiteMonthlyCents("ecommerce", "USD")).toBe(9_900);
    expect(websiteBuildFeeCents("b2b", "INR")).toBe(3_500_000);
    expect(websiteBuildFeeCents("ecommerce", "INR")).toBe(6_500_000);
    expect(websiteBuildFeeCents("b2b", "USD")).toBe(120_000);
    expect(websiteBuildFeeCents("ecommerce", "USD")).toBe(450_000);
  });
  it("prices only the website line by kind", () => {
    const website = addOnById("managed-website");
    const social = addOnById("social-media");
    expect(cyclePriceCents(website, "INR", "month", "ecommerce")).toBe(399_900);
    expect(cyclePriceCents(website, "INR", "month")).toBe(299_900);
    expect(cyclePriceCents(social, "INR", "month", "ecommerce")).toBe(299_900);
    expect(addOnPrice(website, "INR", 0, "year", "ecommerce").listCents).toBe(4_318_900);
  });
  it("prices a basket by kind", () => {
    const lines = packageLines({ services: ["managed-website", "social-media"], forfeited: true }, "INR", "month", "ecommerce");
    expect(lines.map((line) => line.netCents)).toEqual([399_900, 299_900]);
  });
});
