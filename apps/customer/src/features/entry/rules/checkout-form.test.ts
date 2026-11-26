import { describe, expect, it } from "vitest";
import { parseCheckoutSignupForm } from "./checkout-form";

/** The base fields without one named key. */
function without<T extends Record<string, unknown>>(entries: T, key: keyof T): Record<string, string | readonly string[]> {
  return Object.fromEntries(Object.entries(entries).filter(([name]) => name !== key)) as Record<string, string | readonly string[]>;
}

function form(entries: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of typeof value === "string" ? [value] : value) data.append(key, item);
  }
  return data;
}

const base = {
  service: ["managed-website"],
  billing: "monthly",
  name: " Meera  Shah ",
  businessName: " Shah   Sweets ",
  email: " Meera@Example.TEST ",
  phoneCountry: "IN",
  phone: " 98200 11223 ",
  stateCode: "mh",
  agree: "yes",
};
const gstinFields = {
  hasGstin: "on",
  legalName: "Shah Sweets Pvt Ltd",
  gstin: "27AAPFU0939F1ZV",
  addressLine1: "12 Market Road",
  city: "Mumbai",
  postalCode: "400001",
};

describe("parseCheckoutSignupForm", () => {
  it("reads a buyer without a GSTIN: details cleaned, state picked, no billing profile", () => {
    expect(parseCheckoutSignupForm(form(base), "IN")).toEqual({
      success: true,
      data: {
        services: ["managed-website"],
        billing: "monthly",
        name: "Meera Shah",
        businessName: "Shah Sweets",
        email: "meera@example.test",
        phone: { country: "IN", number: "98200 11223" },
        country: "IN",
        stateCode: "mh",
        gstinDetails: null,
        agreed: true,
      },
    });
  });

  it("keeps only catalogue services and needs at least one", () => {
    expect(parseCheckoutSignupForm(form({ ...base, service: ["managed-website", "nonsense"] }), "IN")).toMatchObject({ success: true, data: { services: ["managed-website"] } });
    expect(parseCheckoutSignupForm(form({ ...base, service: ["nonsense"] }), "IN")).toEqual({ success: false, field: "service", message: "Add a service to continue." });
    expect(parseCheckoutSignupForm(form(without(base, "service")), "IN")).toMatchObject({ success: false, field: "service" });
  });

  it("reads yearly, and anything else as monthly", () => {
    expect(parseCheckoutSignupForm(form({ ...base, billing: "yearly" }), "IN")).toMatchObject({ success: true, data: { billing: "yearly" } });
    expect(parseCheckoutSignupForm(form({ ...base, billing: "weekly" }), "IN")).toMatchObject({ success: true, data: { billing: "monthly" } });
  });

  it("refuses the first problem, nearest the top, under its own field", () => {
    expect(parseCheckoutSignupForm(form({ ...base, name: " " }), "IN")).toEqual({ success: false, field: "name", message: "Tell us your name." });
    expect(parseCheckoutSignupForm(form({ ...base, name: "x".repeat(61) }), "IN")).toMatchObject({ success: false, field: "name" });
    expect(parseCheckoutSignupForm(form({ ...base, businessName: "" }), "IN")).toMatchObject({ success: false, field: "businessName" });
    expect(parseCheckoutSignupForm(form({ ...base, businessName: "x".repeat(201) }), "IN")).toMatchObject({ success: false, field: "businessName" });
    expect(parseCheckoutSignupForm(form({ ...base, email: "nope" }), "IN")).toEqual({ success: false, field: "email", message: "Enter a valid email address." });
    expect(parseCheckoutSignupForm(form({ ...base, phone: "" }), "IN")).toEqual({ success: false, field: "phone", message: "Enter your mobile number." });
    expect(parseCheckoutSignupForm(form({ ...base, phoneCountry: "" }), "IN")).toMatchObject({ success: false, field: "phone" });
  });

  it("refuses a number the country could not have, so it never reaches the account step", () => {
    expect(parseCheckoutSignupForm(form({ ...base, phone: "123" }), "IN")).toMatchObject({ success: false, field: "phone" });
    expect(parseCheckoutSignupForm(form({ ...base, phoneCountry: "AE", phone: "50 123 4567" }), "AE")).toMatchObject({ success: true });
  });

  it("needs the state in India, picked from the list", () => {
    expect(parseCheckoutSignupForm(form(without(base, "stateCode")), "IN")).toEqual({ success: false, field: "stateCode", message: "Choose your state." });
    expect(parseCheckoutSignupForm(form({ ...base, stateCode: "zz" }), "IN")).toMatchObject({ success: false, field: "stateCode" });
  });

  it("asks no state and no GSTIN outside India, whatever the form sent", () => {
    const result = parseCheckoutSignupForm(form({ ...base, ...gstinFields }), "AE");
    expect(result).toMatchObject({ success: true, data: { country: "AE", stateCode: null, gstinDetails: null } });
  });

  it("refuses a business name an invoice cannot print, for rupees only", () => {
    const hindi = { ...base, businessName: "शाह मिठाई" };
    expect(parseCheckoutSignupForm(form(hindi), "IN")).toEqual({
      success: false,
      field: "businessName",
      message: "Your business name cannot be printed on an invoice. Use English letters.",
    });
    expect(parseCheckoutSignupForm(form(hindi), "AE")).toMatchObject({ success: true });
  });

  it("prints a curly apostrophe as a plain one", () => {
    expect(parseCheckoutSignupForm(form({ ...base, businessName: "Rao’s Dental" }), "IN")).toMatchObject({ success: true, data: { businessName: "Rao's Dental" } });
  });

  it("with a GSTIN takes the state from it and returns the profile to save", () => {
    const result = parseCheckoutSignupForm(form({ ...base, ...gstinFields, stateCode: "dl" }), "IN");
    expect(result).toMatchObject({
      success: true,
      data: { stateCode: "mh", gstinDetails: { gstin: "27AAPFU0939F1ZV", legalName: "Shah Sweets Pvt Ltd", city: "Mumbai", postalCode: "400001", stateCode: "mh" } },
    });
  });

  it("refuses a ticked GSTIN with missing details using the existing messages, under that field", () => {
    expect(parseCheckoutSignupForm(form({ ...base, ...gstinFields, addressLine1: "" }), "IN")).toEqual({
      success: false,
      field: "addressLine1",
      message: "Enter the street address, in English letters.",
    });
    expect(parseCheckoutSignupForm(form({ ...base, ...gstinFields, gstin: "" }), "IN")).toMatchObject({ success: false, field: "gstin" });
  });

  it("needs the Terms box ticked, and says so at the box", () => {
    expect(parseCheckoutSignupForm(form(without(base, "agree")), "IN")).toEqual({
      success: false,
      field: "agree",
      message: "Tick the box to agree to the Terms and Privacy Notice.",
    });
  });
});
