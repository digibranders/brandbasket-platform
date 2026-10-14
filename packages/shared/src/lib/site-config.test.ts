import { isValidGstin, stateCodeOfGstin } from "@fynix/billing/gstin";
import { describe, expect, it } from "vitest";
import { businessDetails, siteConfig } from "./site-config";

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

describe("what customers read", () => {
  it("trades as Fynix Digital with Fynix's own contact, the registered company unchanged", () => {
    expect(businessDetails).toMatchObject({
      legalName: "Digibranders Private Limited",
      tradeName: "Fynix Digital",
      email: "hello@fynix.digital",
      website: "https://fynix.digital",
    });
    expect(siteConfig).toMatchObject({ name: "Fynix Digital", email: "hello@fynix.digital", url: "https://fynix.digital" });
  });
});
