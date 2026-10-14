import type { BillingProfileInput } from "@fynix/db";
import { describe, expect, it } from "vitest";
import { billingDetailsStart, savedBillingDetails } from "./billing-details-start";

const PROFILE: BillingProfileInput = {
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  legalName: "Riverside Dental LLP",
  gstin: "27AAPFU0939F1ZV",
  addressLine1: "12 MG Road",
  addressLine2: "Andheri East",
  city: "Mumbai",
  postalCode: "400069",
  stateCode: "mh",
  email: "accounts@riverside.example",
  phone: "+912212345678",
};

const NO_PHONE = { country: null, number: "" } as const;

describe("savedBillingDetails", () => {
  it("lists the address on one line with the city and pincode last", () => {
    expect(savedBillingDetails(PROFILE).address).toBe("12 MG Road, Andheri East, Mumbai 400069");
  });

  it("leaves out a second address line that was not given", () => {
    expect(savedBillingDetails({ ...PROFILE, addressLine2: null }).address).toBe("12 MG Road, Mumbai 400069");
  });

  it("keeps the optional contact parts as null for the card to word", () => {
    expect(savedBillingDetails({ ...PROFILE, gstin: null, email: null, phone: null })).toMatchObject({
      gstin: null,
      email: null,
      phone: null,
    });
  });
});

describe("billingDetailsStart", () => {
  const onboarding = {
    addressLine1: "5 Park Street",
    addressLine2: null,
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411001",
  };

  it("starts from the saved details when there are some", () => {
    expect(
      billingDetailsStart({ profile: PROFILE, businessName: "Riverside", onboarding, phone: { country: "IN", number: "022 1234 5678" } }),
    ).toEqual({
      legalName: "Riverside Dental LLP",
      gstin: "27AAPFU0939F1ZV",
      addressLine1: "12 MG Road",
      addressLine2: "Andheri East",
      city: "Mumbai",
      postalCode: "400069",
      stateCode: "mh",
      email: "accounts@riverside.example",
      phoneCountry: "IN",
      phone: "022 1234 5678",
    });
  });

  it("starts from the business name and its onboarding address when nothing is saved", () => {
    expect(billingDetailsStart({ profile: null, businessName: "Riverside", onboarding, phone: NO_PHONE })).toEqual({
      legalName: "Riverside",
      gstin: "",
      addressLine1: "5 Park Street",
      addressLine2: "",
      city: "Pune",
      postalCode: "411001",
      stateCode: "mh",
      email: "",
      phoneCountry: "IN",
      phone: "",
    });
  });

  it("starts empty, on India, when there is no saved profile and no onboarding profile", () => {
    expect(billingDetailsStart({ profile: null, businessName: "Riverside", onboarding: null, phone: NO_PHONE })).toMatchObject({
      legalName: "Riverside",
      addressLine1: "",
      city: "",
      stateCode: "",
      phoneCountry: "IN",
    });
  });

  it("leaves the state to be chosen when the onboarding region is not a state", () => {
    const start = billingDetailsStart({ profile: null, businessName: "Riverside", onboarding: { ...onboarding, region: "Mumbai Suburban" }, phone: NO_PHONE });
    expect(start.stateCode).toBe("");
  });

  it("uses the saved phone's own country", () => {
    expect(
      billingDetailsStart({ profile: { ...PROFILE, phone: "+14155550123" }, businessName: "Riverside", onboarding: null, phone: { country: "US", number: "(415) 555-0123" } }),
    ).toMatchObject({ phoneCountry: "US", phone: "(415) 555-0123" });
  });
});
