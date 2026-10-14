import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  CHOOSE_COUNTRY_MESSAGE,
  countryNameOf,
  INTERNATIONAL_PHONE_MESSAGE,
  optionalPhone,
  parsePhoneEntry,
  PHONE_TOO_LONG_MESSAGE,
  phoneFormField,
  requiredPhone,
  supportedCountryOf,
} = await import("./phone");

const MISSING = "Enter a phone number.";

describe("parsePhoneEntry", () => {
  it("reads a national number for the chosen country and stores E.164", () => {
    expect(parsePhoneEntry({ country: "IN", number: "98765 43210" }, MISSING)).toEqual({
      success: true,
      e164: "+919876543210",
    });
    expect(parsePhoneEntry({ country: "GB", number: "07400 123456" }, MISSING)).toEqual({
      success: true,
      e164: "+447400123456",
    });
    expect(parsePhoneEntry({ country: "US", number: "(213) 373-4253" }, MISSING)).toEqual({
      success: true,
      e164: "+12133734253",
    });
  });

  it("reads a number starting with + or 00 as international and ignores the country", () => {
    expect(parsePhoneEntry({ country: "US", number: "+91 98765 43210" }, MISSING)).toEqual({
      success: true,
      e164: "+919876543210",
    });
    expect(parsePhoneEntry({ country: "", number: "0044 7400 123456" }, MISSING)).toEqual({
      success: true,
      e164: "+447400123456",
    });
    expect(parsePhoneEntry({ country: "nowhere", number: "+44.20.7946.0958" }, MISSING)).toEqual({
      success: true,
      e164: "+442079460958",
    });
  });

  it("strips control characters before parsing", () => {
    expect(parsePhoneEntry({ country: "IN", number: " 98765\u0000 43210\r\n" }, MISSING)).toEqual({
      success: true,
      e164: "+919876543210",
    });
  });

  it("names the country when a national number does not fit it", () => {
    expect(parsePhoneEntry({ country: "IN", number: "12345" }, MISSING)).toEqual({
      success: false,
      part: "number",
      message: "Enter a valid phone number for India.",
    });
    // A real Indian mobile number is not a valid UK one.
    expect(parsePhoneEntry({ country: "GB", number: "98765 43210" }, MISSING)).toEqual({
      success: false,
      part: "number",
      message: "Enter a valid phone number for United Kingdom.",
    });
  });

  it("asks for the country code when an international number is not valid", () => {
    for (const number of ["+1 555 0100", "+999 1234 5678", "00 12", "+91 call me"]) {
      expect(parsePhoneEntry({ country: "IN", number }, MISSING), number).toEqual({
        success: false,
        part: "number",
        message: INTERNATIONAL_PHONE_MESSAGE,
      });
    }
  });

  it("refuses text, extensions and anything that is only partly a number", () => {
    for (const number of ["call me", "98765 43210 ext. 22", "Tel: 98765 43210", "+44 7700 900123 x22"]) {
      expect(parsePhoneEntry({ country: "IN", number }, MISSING), number).toMatchObject({
        success: false,
        part: "number",
      });
    }
  });

  it("points at the country select when a national number has no usable country", () => {
    for (const country of ["", "  ", "ZZ", "in", "IND", "constructor", "__proto__", "EU"]) {
      expect(parsePhoneEntry({ country, number: "98765 43210" }, MISSING), country).toEqual({
        success: false,
        part: "country",
        message: CHOOSE_COUNTRY_MESSAGE,
      });
    }
  });

  it("uses the form's own message for a missing required number, whatever the country", () => {
    expect(parsePhoneEntry({ country: "IN", number: "   " }, MISSING)).toEqual({
      success: false,
      part: "number",
      message: MISSING,
    });
    expect(parsePhoneEntry({ country: "", number: "" }, MISSING)).toMatchObject({ part: "number", message: MISSING });
  });

  it("treats a blank optional number as none, without needing a country", () => {
    expect(parsePhoneEntry({ country: "", number: " " }, null)).toEqual({ success: true, e164: null });
  });

  it("refuses a number longer than the input allows", () => {
    expect(parsePhoneEntry({ country: "IN", number: "9".repeat(41) }, MISSING)).toEqual({
      success: false,
      part: "number",
      message: PHONE_TOO_LONG_MESSAGE,
    });
  });
});

describe("requiredPhone and optionalPhone", () => {
  it("return E.164, or null for a blank optional number", () => {
    expect(requiredPhone(MISSING).parse({ country: "IN", number: "098765 43210" })).toBe("+919876543210");
    expect(optionalPhone.parse({ country: "", number: "" })).toBeNull();
    expect(optionalPhone.parse({ country: "AU", number: "0412 345 678" })).toBe("+61412345678");
  });

  it("put the issue on the path of the input it is about", () => {
    const missingCountry = optionalPhone.safeParse({ country: "", number: "98765 43210" });
    expect(missingCountry.error?.issues[0]).toMatchObject({ path: ["country"], message: CHOOSE_COUNTRY_MESSAGE });
    const invalid = requiredPhone(MISSING).safeParse({ country: "IN", number: "1" });
    expect(invalid.error?.issues[0]).toMatchObject({
      path: ["number"],
      message: "Enter a valid phone number for India.",
    });
  });
});

describe("phoneFormField", () => {
  it("maps a phone issue to the form field to focus", () => {
    expect(phoneFormField("country")).toBe("phoneCountry");
    expect(phoneFormField("number")).toBe("phone");
    expect(phoneFormField(undefined)).toBe("phone");
  });
});

describe("supportedCountryOf and countryNameOf", () => {
  it("accept only supported two-letter codes", () => {
    expect(supportedCountryOf("IN")).toBe("IN");
    expect(supportedCountryOf("in")).toBeNull();
    expect(supportedCountryOf("XX")).toBeNull();
    expect(supportedCountryOf("hasOwnProperty")).toBeNull();
  });

  it("name countries in English", () => {
    expect(countryNameOf("IN")).toBe("India");
    expect(countryNameOf("DE")).toBe("Germany");
  });
});
