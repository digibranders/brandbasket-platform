import { describe, expect, it } from "vitest";
import { cleanCampaign, normalizePath } from "./normalize-path";

describe("normalizePath", () => {
  it("keeps the path only: no query, no fragment, no trailing slash", () => {
    expect(normalizePath("/about/?ref=x#team")).toBe("/about");
    expect(normalizePath("/services/dental")).toBe("/services/dental");
  });

  it("takes the path of a full address and ignores its host", () => {
    expect(normalizePath("https://Example.com/Services/?a=b")).toBe("/services");
    expect(normalizePath("//other.example/x")).toBe("/x");
  });

  it("gives the home page as a single slash", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("https://example.com")).toBe("/");
    expect(normalizePath("/?utm_source=x")).toBe("/");
  });

  it("adds a missing leading slash and lower-cases, so one page is one row", () => {
    expect(normalizePath("About-Us")).toBe("/about-us");
  });

  it("hides a path segment that holds an email address", () => {
    expect(normalizePath("/thanks/asha@example.com/done")).toBe("/thanks/redacted/done");
  });

  it("caps a path at 200 characters", () => {
    expect(normalizePath(`/${"a".repeat(300)}`)).toHaveLength(200);
  });

  it("refuses what is not a path", () => {
    expect(normalizePath("")).toBeNull();
    expect(normalizePath("   ")).toBeNull();
    expect(normalizePath(42)).toBeNull();
    expect(normalizePath("http://")).toBeNull();
  });
});

describe("cleanCampaign", () => {
  it("trims, lower-cases and squeezes spaces", () => {
    expect(cleanCampaign("  Diwali   Offer ")).toBe("diwali offer");
  });

  it("caps at 60 characters", () => {
    expect(cleanCampaign("a".repeat(100))).toHaveLength(60);
  });

  it("drops a value that looks like an email or holds a long number", () => {
    expect(cleanCampaign("asha@example.com")).toBeNull();
    expect(cleanCampaign("order 123456")).toBeNull();
    expect(cleanCampaign("sale 2026")).toBe("sale 2026");
  });

  it("drops empty and non-text values", () => {
    expect(cleanCampaign("")).toBeNull();
    expect(cleanCampaign(null)).toBeNull();
    expect(cleanCampaign(7)).toBeNull();
  });
});
