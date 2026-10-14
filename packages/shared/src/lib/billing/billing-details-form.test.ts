import { describe, expect, it, vi } from "vitest";

// billing-details-form.ts imports validation/phone.ts, which is marked "server-only" and throws under plain Node; stub
// it the same way phone.test.ts does, and import the module under test afterwards so the mock is in place first.
vi.mock("server-only", () => ({}));

const { firstBillingDetailsProblem, parseBillingDetails, parseCustomerBillingDetails, pincodeStateProblem } = await import("./billing-details-form");

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  const defaults = {
    legalName: "QA Premium Business",
    gstin: "",
    addressLine1: "Shop 4, Gokul Arcade",
    addressLine2: "",
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
    email: "",
    phoneCountry: "IN",
    phone: "",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...fields })) data.set(key, value);
  return data;
};

describe("parseBillingDetails", () => {
  it("accepts details without a GSTIN", () => {
    expect(parseBillingDetails(form({}))).toMatchObject({ ok: true, details: { gstin: null, addressLine2: null, stateCode: "mh" } });
  });

  it("accepts the punctuation Indian addresses use", () => {
    expect(parseBillingDetails(form({ addressLine1: "#12, 3rd Cross: Near St. Mary's [Gate 2]" }))).toMatchObject({ ok: true });
  });

  it("normalises a GSTIN and requires its state to match the address state", () => {
    expect(parseBillingDetails(form({ gstin: "27aapfu 0939f1zv" }))).toMatchObject({ ok: true, details: { gstin: "27AAPFU0939F1ZV" } });
    expect(parseBillingDetails(form({ gstin: "27AAPFU0939F1ZV", stateCode: "ka" }))).toEqual({
      ok: false,
      errors: { stateCode: "This GSTIN is registered in Maharashtra. Choose Maharashtra, or check the GSTIN." },
    });
  });

  it("explains a GSTIN that fails its check", () => {
    expect(parseBillingDetails(form({ gstin: "29AAPFU0939F1ZV" }))).toEqual({
      ok: false,
      errors: { gstin: "This GSTIN is not valid. Check it against your GST registration certificate." },
    });
  });

  it("asks for the name in English letters, as on the GST registration", () => {
    expect(parseBillingDetails(form({ legalName: "क्यूए प्रीमियम" }))).toMatchObject({
      ok: false,
      errors: { legalName: "Enter the name as on your GST registration, in English letters." },
    });
  });

  it("accepts a name and address typed with curly quotes, dashes and no-break spaces, and saves them as plain characters", () => {
    expect(
      parseBillingDetails(
        form({ legalName: "Dr. Rao\u2019s Dental\u00A0Clinic", addressLine1: "Shop 4\u2013B, \u201CGokul\u201D Arcade", addressLine2: "Near St. Mary\u2019s", city: "Navi\u00A0Mumbai" }),
      ),
    ).toMatchObject({
      ok: true,
      details: { legalName: "Dr. Rao's Dental Clinic", addressLine1: 'Shop 4-B, "Gokul" Arcade', addressLine2: "Near St. Mary's", city: "Navi Mumbai" },
    });
  });

  it("still asks for English letters when a name has letters of another script next to curly quotes", () => {
    expect(parseBillingDetails(form({ legalName: "\u0936\u0930\u094D\u092E\u093E\u2019s" }))).toMatchObject({
      ok: false,
      errors: { legalName: "Enter the name as on your GST registration, in English letters." },
    });
  });

  it("keeps an optional billing email and phone, the phone as E.164", () => {
    expect(parseBillingDetails(form({}))).toMatchObject({ ok: true, details: { email: null, phone: null } });
    expect(parseBillingDetails(form({ email: "Accounts@QAPremium.in", phone: "98200 12345" }))).toMatchObject({
      ok: true,
      details: { email: "accounts@qapremium.in", phone: "+919820012345" },
    });
    expect(parseBillingDetails(form({ email: "accounts@" }))).toMatchObject({ ok: false, errors: { email: "Enter a valid email address." } });
    expect(parseBillingDetails(form({ phone: "12345" }))).toMatchObject({ ok: false, errors: { phone: expect.any(String) } });
  });

  it("refuses a pincode that is not six digits and a state it does not know", () => {
    expect(parseBillingDetails(form({ postalCode: "40008" }))).toMatchObject({ ok: false, errors: { postalCode: "Enter a 6 digit pincode." } });
    expect(parseBillingDetails(form({ stateCode: "xx" }))).toMatchObject({ ok: false, errors: { stateCode: "Choose your state." } });
  });
});

describe("firstBillingDetailsProblem", () => {
  it("names the first problem in the order the form shows its fields", () => {
    expect(firstBillingDetailsProblem({ city: "Enter the city, in English letters.", legalName: "Enter the name to bill, as on your GST registration." })).toEqual({
      field: "legalName",
      message: "Enter the name to bill, as on your GST registration.",
    });
  });
});

describe("parseCustomerBillingDetails", () => {
  const context = { businessName: "Rao's Dental", keep: { legalName: null, email: "accounts@rao.in", phone: "+919820012345" } };
  const customerForm = (fields: Record<string, string>): FormData => {
    const data = new FormData();
    const defaults = { addressLine1: "Shop 4, Gokul Arcade", addressLine2: "", city: "Mumbai", postalCode: "400080", stateCode: "mh" };
    for (const [key, value] of Object.entries({ ...defaults, ...fields })) data.set(key, value);
    return data;
  };

  it("bills the business's own name when there is no GSTIN, and ignores a GSTIN or name left in the form", () => {
    expect(parseCustomerBillingDetails(customerForm({ gstin: "27AAPFU0939F1ZV", legalName: "Someone Else" }), context)).toEqual({
      ok: true,
      details: {
        legalName: "Rao's Dental",
        gstin: null,
        addressLine1: "Shop 4, Gokul Arcade",
        addressLine2: null,
        city: "Mumbai",
        postalCode: "400080",
        stateCode: "mh",
        email: "accounts@rao.in",
        phone: "+919820012345",
      },
    });
  });

  it("takes the GSTIN, the legal name and the state from the GSTIN when the box is ticked", () => {
    expect(
      parseCustomerBillingDetails(customerForm({ hasGstin: "on", gstin: "27aapfu 0939f1zv", legalName: "QA Premium Pvt Ltd", stateCode: "ka" }), context),
    ).toMatchObject({ ok: true, details: { legalName: "QA Premium Pvt Ltd", gstin: "27AAPFU0939F1ZV", stateCode: "mh" } });
  });

  it("asks for the GSTIN when the box is ticked and it is blank or wrong", () => {
    expect(parseCustomerBillingDetails(customerForm({ hasGstin: "on", legalName: "QA" }), context)).toEqual({
      ok: false,
      errors: { gstin: "Enter your 15 character GSTIN, or untick the box if you do not have one." },
    });
    expect(parseCustomerBillingDetails(customerForm({ hasGstin: "on", gstin: "29AAPFU0939F1ZV", legalName: "QA" }), context)).toEqual({
      ok: false,
      errors: { gstin: "This GSTIN is not valid. Check it against your GST registration certificate." },
    });
  });

  it("asks for the legal name when the box is ticked", () => {
    expect(parseCustomerBillingDetails(customerForm({ hasGstin: "on", gstin: "27AAPFU0939F1ZV", legalName: " " }), context)).toEqual({
      ok: false,
      errors: { legalName: "Enter the name to bill, as on your GST registration." },
    });
  });

  it("asks for a state when there is no GSTIN to take it from", () => {
    expect(parseCustomerBillingDetails(customerForm({ stateCode: "" }), context)).toEqual({ ok: false, errors: { stateCode: "Choose your state." } });
  });

  it("checks the address", () => {
    expect(parseCustomerBillingDetails(customerForm({ addressLine1: "", city: "", postalCode: "12" }), context)).toEqual({
      ok: false,
      errors: {
        addressLine1: "Enter the street address, in English letters.",
        city: "Enter the city, in English letters.",
        postalCode: "Enter a 6 digit pincode.",
      },
    });
  });

  it("keeps a legal name saved without a GSTIN, since the form shows no name field then", () => {
    expect(parseCustomerBillingDetails(customerForm({}), { ...context, keep: { ...context.keep, legalName: "Rao Dental LLP" } })).toMatchObject({
      ok: true,
      details: { legalName: "Rao Dental LLP", gstin: null },
    });
  });

  it("says so, under the checkbox, when the name an invoice would carry cannot be printed", () => {
    for (const businessName of ["राव डेंटल", "x".repeat(201)]) {
      expect(parseCustomerBillingDetails(customerForm({}), { ...context, businessName })).toMatchObject({
        ok: false,
        errors: { hasGstin: expect.stringContaining("cannot be printed") },
      });
    }
  });
});

describe("pincodeStateProblem", () => {
  it("accepts a pincode in the chosen state and names the state it is in otherwise", () => {
    expect(pincodeStateProblem("mh", "mh")).toBeNull();
    expect(pincodeStateProblem("mh", "ka")).toBe("This pincode is in Maharashtra. Choose Maharashtra, or check the pincode.");
  });
});
