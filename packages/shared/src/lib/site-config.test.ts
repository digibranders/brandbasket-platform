import { isValidGstin, stateCodeOfGstin } from "@brandbasket/billing/gstin";
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
  it("trades as Brandbasket with Brandbasket's own contact, the registered company unchanged", () => {
    expect(businessDetails).toMatchObject({
      legalName: "Digibranders Private Limited",
      tradeName: "Brandbasket",
      email: "hello@brandbasket.in",
      website: "https://brandbasket.in",
    });
    expect(siteConfig).toMatchObject({ name: "Brandbasket", email: "hello@brandbasket.in", url: "https://brandbasket.in" });
  });
});
