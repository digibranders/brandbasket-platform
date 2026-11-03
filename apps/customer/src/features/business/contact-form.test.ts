import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/form";
import { contactSchema } from "./contact-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const VALID = { displayName: "Apex Diagnostics", phone: "98201 55012", phoneCountry: "IN", email: "Hello@ApexDiagnostics.in" };

describe("contactSchema", () => {
  it("returns every contact field, a number as E.164 and an address as typed", () => {
    expect(
      parseForm(contactSchema, form({ ...VALID, addressLine1: " Shop 4 ", addressLine2: "", city: "Mumbai", region: "Maharashtra", postalCode: "400028", country: "India", serviceAreas: "Dadar, Matunga" })),
    ).toEqual({
      ok: true,
      data: {
        displayName: "Apex Diagnostics",
        phone: "+919820155012",
        email: "hello@apexdiagnostics.in",
        addressLine1: "Shop 4",
        addressLine2: null,
        city: "Mumbai",
        region: "Maharashtra",
        postalCode: "400028",
        country: "India",
        serviceAreas: "Dadar, Matunga",
      },
    });
  });

  it("turns blanks into null so saving a blank clears the field", () => {
    expect(parseForm(contactSchema, form({ displayName: "Apex", phone: "", phoneCountry: "IN", email: "" }))).toEqual({
      ok: true,
      data: { displayName: "Apex", phone: null, email: null, addressLine1: null, addressLine2: null, city: null, region: null, postalCode: null, country: null, serviceAreas: null },
    });
  });

  it("needs a business name of 1 to 120 characters", () => {
    expect(parseForm(contactSchema, form({ ...VALID, displayName: "  " }))).toMatchObject({ ok: false, fieldErrors: { displayName: "Tell us your business name." } });
    expect(parseForm(contactSchema, form({ ...VALID, displayName: "x".repeat(121) }))).toMatchObject({ ok: false, fieldErrors: { displayName: "That business name is too long." } });
    expect(parseForm(contactSchema, form({ ...VALID, displayName: "x".repeat(120) })).ok).toBe(true);
  });

  it("holds each field to its limit", () => {
    const over: Record<string, readonly [string, number]> = {
      addressLine1: ["That address line is too long.", 120],
      addressLine2: ["That address line is too long.", 120],
      city: ["That city name is too long.", 80],
      region: ["That state or region is too long.", 80],
      postalCode: ["That postal code is too long.", 20],
      country: ["That country name is too long.", 80],
      serviceAreas: ["Keep the areas you serve to 300 characters.", 300],
    };
    for (const [field, [message, max]] of Object.entries(over)) {
      expect(parseForm(contactSchema, form({ ...VALID, [field]: "x".repeat(max) })).ok, `${field} at the limit`).toBe(true);
      expect(parseForm(contactSchema, form({ ...VALID, [field]: "x".repeat(max + 1) })), `${field} over the limit`).toMatchObject({ ok: false, fieldErrors: { [field]: message } });
    }
  });

  it("refuses a phone number that is not valid for its country, on the phone field", () => {
    expect(parseForm(contactSchema, form({ ...VALID, phone: "12345" }))).toMatchObject({ ok: false, fieldErrors: { phone: expect.stringContaining("valid phone number") } });
  });

  it("reads a number starting with + as international whatever the country", () => {
    expect(parseForm(contactSchema, form({ ...VALID, phone: "+44 20 7946 0958", phoneCountry: "IN" }))).toMatchObject({ ok: true, data: { phone: "+442079460958" } });
  });

  it("asks for a country for a national number when none is chosen", () => {
    expect(parseForm(contactSchema, form({ ...VALID, phoneCountry: "" }))).toMatchObject({ ok: false, fieldErrors: { phoneCountry: "Choose your country code." } });
  });

  it("refuses an email that is not an address", () => {
    expect(parseForm(contactSchema, form({ ...VALID, email: "not an email" }))).toMatchObject({ ok: false, fieldErrors: { email: "Enter a valid email address." } });
  });

  it("does not read the tagline, description or Google link: they are not editable here", () => {
    const parsed = parseForm(contactSchema, form({ ...VALID, tagline: "Hello", description: "x", googleBusinessUrl: "https://g.page/x" }));
    expect(parsed.ok && "tagline" in parsed.data).toBe(false);
    expect(parsed.ok && "googleBusinessUrl" in parsed.data).toBe(false);
  });
});
