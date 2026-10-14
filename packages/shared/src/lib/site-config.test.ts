import { isValidGstin, stateCodeOfGstin } from "@firstfold/billing/gstin";
import { describe, expect, it, vi } from "vitest";
import { businessDetails, deploymentBusinessDetails } from "./site-config";

describe("businessDetails", () => {
  it("carries a valid GSTIN registered in the state it names, so CGST and SGST are never decided against the wrong one", () => {
    expect(isValidGstin(businessDetails.gstNumber)).toBe(true);
    expect(stateCodeOfGstin(businessDetails.gstNumber)).toBe(businessDetails.stateCode);
  });

  it("names the company, its CIN and an address that fits the invoice's supplier block", () => {
    expect(businessDetails.legalName).toBe("Digibranders Private Limited");
    expect(businessDetails.cin).toMatch(/^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/);
    expect(businessDetails.address).toHaveLength(3);
  });
});

describe("deploymentBusinessDetails", () => {
  it("is the registered details as they are on a Firstfold server", () => {
    expect(deploymentBusinessDetails({})).toBe(businessDetails);
  });

  it("keeps the company, GSTIN and address on a Fynix server and trades as Fynix Digital with Fynix's own contact", () => {
    const fynix = deploymentBusinessDetails({ PLATFORM_BRAND: "fynix" });
    expect(fynix).toMatchObject({
      legalName: businessDetails.legalName,
      gstNumber: businessDetails.gstNumber,
      cin: businessDetails.cin,
      address: businessDetails.address,
      tradeName: "Fynix Digital",
      email: "hello@fynix.digital",
      website: "https://fynix.digital",
    });
    expect(`${fynix.tradeName} ${fynix.email} ${fynix.website}`).not.toMatch(/first\s?fold/i);
  });
});

describe("the site and business as a Fynix process loads them", () => {
  it("name Fynix everywhere a customer could read it, with the registered company unchanged", async () => {
    const before = process.env.PLATFORM_BRAND;
    process.env.PLATFORM_BRAND = "fynix";
    vi.resetModules();
    try {
      const loaded = await import("./site-config");
      expect(loaded.siteConfig).toMatchObject({ name: "Fynix Digital", email: "hello@fynix.digital", url: "https://fynix.digital" });
      expect(loaded.businessDetails).toMatchObject({ legalName: "Digibranders Private Limited", tradeName: "Fynix Digital", email: "hello@fynix.digital" });
      expect(`${loaded.siteConfig.name} ${loaded.siteConfig.email} ${loaded.siteConfig.url} ${loaded.businessDetails.tradeName} ${loaded.businessDetails.website}`).not.toMatch(/first\s?fold/i);
    } finally {
      if (before === undefined) delete process.env.PLATFORM_BRAND;
      else process.env.PLATFORM_BRAND = before;
      vi.resetModules();
    }
  });
});
