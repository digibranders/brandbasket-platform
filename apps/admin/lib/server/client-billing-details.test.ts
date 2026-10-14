import type { BillingProfile } from "@firstfold/db";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/shared/server/phone-countries", () => ({ phoneCountryOptions: () => [{ code: "IN" }] }));
vi.mock("@firstfold/shared/server/phone-defaults", () => ({
  savedPhoneStart: (saved: string | null) => (saved === null ? { country: null, number: "" } : { country: "IN", number: "98765 43210" }),
}));

import { clientBillingDetails } from "./client-billing-details";

const PROFILE: BillingProfile = {
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  legalName: "Riverside Dental LLP",
  gstin: "27AAPFU0939F1ZV",
  addressLine1: "12 MG Road",
  addressLine2: null,
  city: "Mumbai",
  postalCode: "400069",
  stateCode: "mh",
  email: null,
  phone: "+919876543210",
  updatedAt: new Date("2026-10-09T09:00:00Z"),
};

const ONBOARDING = { addressLine1: "5 Park Street", addressLine2: null, city: "Pune", region: "Maharashtra", postalCode: "411001" };

describe("clientBillingDetails", () => {
  it("lists what is saved and starts the form from it, with the phone split for its field", () => {
    const view = clientBillingDetails({ profile: PROFILE, businessName: "Riverside", onboarding: ONBOARDING });
    expect(view.saved).toMatchObject({ legalName: "Riverside Dental LLP", address: "12 MG Road, Mumbai 400069", stateCode: "mh" });
    expect(view.start).toMatchObject({ legalName: "Riverside Dental LLP", city: "Mumbai", phoneCountry: "IN", phone: "98765 43210" });
    expect(view.phoneCountries).toEqual([{ code: "IN" }]);
  });

  it("lists nothing when nothing is saved, and starts the form from the business name and onboarding address", () => {
    const view = clientBillingDetails({ profile: null, businessName: "Riverside", onboarding: ONBOARDING });
    expect(view.saved).toBeNull();
    expect(view.start).toMatchObject({ legalName: "Riverside", addressLine1: "5 Park Street", city: "Pune", stateCode: "mh", phone: "" });
  });
});
