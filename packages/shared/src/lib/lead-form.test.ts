import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isHoneypotFilled, leadValuesFrom, parseLeadForm } = await import("./lead-form");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const valid = {
  name: "  Riley Owner ",
  businessName: " Riverside Plumbing ",
  email: " Owner@Example.COM ",
  phone: " 98765 43210 ",
  phoneCountry: "IN",
  businessType: "home_services",
  message: "  We need a site before summer.  ",
};

describe("parseLeadForm", () => {
  it("trims, lowercases the email, stores the phone as E.164 and keeps the message", () => {
    expect(parseLeadForm(form(valid))).toEqual({
      success: true,
      data: {
        name: "Riley Owner",
        businessName: "Riverside Plumbing",
        email: "owner@example.com",
        phone: "+919876543210",
        businessType: "home_services",
        message: "We need a site before summer.",
      },
    });
  });

  it("treats a blank message as none", () => {
    const result = parseLeadForm(form({ ...valid, message: "   " }));
    expect(result).toMatchObject({ success: true, data: { message: null } });
  });

  it("requires a name, business name and phone", () => {
    expect(parseLeadForm(form({ ...valid, name: " " })).success).toBe(false);
    expect(parseLeadForm(form({ ...valid, businessName: "" })).success).toBe(false);
    expect(parseLeadForm(form({ ...valid, phone: "" })).success).toBe(false);
  });

  it("reports the first problem with the field it belongs to", () => {
    expect(parseLeadForm(form({ ...valid, email: "owner@" }))).toMatchObject({
      success: false,
      field: "email",
      message: "Enter a valid email address.",
    });
  });

  it("strips control characters from single-line fields", () => {
    const result = parseLeadForm(
      form({ ...valid, name: "Riley\r\nBcc: someone@example.com", businessName: "Bella\u0000 Vista" }),
    );
    expect(result).toMatchObject({
      success: true,
      data: { name: "Riley Bcc: someone@example.com", businessName: "Bella Vista" },
    });
  });

  it("keeps real line breaks in the message", () => {
    const result = parseLeadForm(form({ ...valid, message: "Line one.\r\nLine two." }));
    expect(result).toMatchObject({ success: true, data: { message: "Line one.\nLine two." } });
  });

  it("names the field that failed", () => {
    expect(parseLeadForm(form({ ...valid, name: " " }))).toMatchObject({ field: "name" });
    expect(parseLeadForm(form({ ...valid, businessName: " " }))).toMatchObject({ field: "businessName" });
    expect(parseLeadForm(form({ ...valid, phone: "12" }))).toMatchObject({ field: "phone" });
  });

  it("rejects values past their maximum length", () => {
    expect(parseLeadForm(form({ ...valid, name: "x".repeat(121) })).success).toBe(false);
    expect(parseLeadForm(form({ ...valid, businessName: "x".repeat(121) })).success).toBe(false);
    expect(parseLeadForm(form({ ...valid, phone: "1".repeat(41) })).success).toBe(false);
    expect(parseLeadForm(form({ ...valid, email: `${"x".repeat(250)}@example.com` })).success).toBe(false);
  });

  it("rejects a message that is too long", () => {
    expect(parseLeadForm(form({ ...valid, message: "x".repeat(1001) })).success).toBe(false);
  });

  it("accepts phone numbers in the shapes people actually type", () => {
    for (const [phoneCountry, phone, stored] of [
      ["IN", "+91 98765 43210", "+919876543210"],
      ["IN", "098765-43210", "+919876543210"],
      ["GB", "(020) 7946 0958", "+442079460958"],
      ["GB", "07400 123456", "+447400123456"],
      ["IN", "+44.20.7946.0958", "+442079460958"],
      ["IN", "0044 20 7946 0958", "+442079460958"],
      ["US", "213-373-4253", "+12133734253"],
    ] as const) {
      expect(parseLeadForm(form({ ...valid, phoneCountry, phone })), phone).toMatchObject({
        success: true,
        data: { phone: stored },
      });
    }
  });

  it("rejects a phone number that is not a phone number", () => {
    expect(parseLeadForm(form({ ...valid, phone: "call me" }))).toMatchObject({
      success: false,
      field: "phone",
      message: "Enter a valid phone number for India.",
    });
    expect(parseLeadForm(form({ ...valid, phone: "+44 7700 900 123 x22" })).success).toBe(false);
  });

  it("checks a national number against the chosen country", () => {
    expect(parseLeadForm(form({ ...valid, phoneCountry: "GB", phone: "98765 43210" }))).toMatchObject({
      success: false,
      field: "phone",
      message: "Enter a valid phone number for United Kingdom.",
    });
    expect(parseLeadForm(form({ ...valid, phone: "12 34 5" }))).toMatchObject({
      success: false,
      field: "phone",
      message: "Enter a valid phone number for India.",
    });
  });

  it("asks for the country code when an international number is not valid", () => {
    for (const phone of ["+1234567890123456", "+1 555 0100"]) {
      expect(parseLeadForm(form({ ...valid, phone })), phone).toMatchObject({
        success: false,
        field: "phone",
        message: "Enter a valid phone number, including the country code.",
      });
    }
  });

  it("points at the country select when the country is missing or unknown", () => {
    for (const phoneCountry of ["", "ZZ", "india", "<script>"]) {
      expect(parseLeadForm(form({ ...valid, phoneCountry })), phoneCountry).toMatchObject({
        success: false,
        field: "phoneCountry",
        message: "Choose your country code.",
      });
    }
    const withoutCountry = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "phoneCountry"));
    expect(parseLeadForm(form(withoutCountry))).toMatchObject({ success: false, field: "phoneCountry" });
  });

  it("says a phone is required before asking for its country", () => {
    expect(parseLeadForm(form({ ...valid, phone: " ", phoneCountry: "" }))).toMatchObject({
      success: false,
      field: "phone",
      message: "Enter a phone number we can reach you on.",
    });
  });

  it("does not ask for a country when the number carries its own", () => {
    expect(parseLeadForm(form({ ...valid, phoneCountry: "", phone: "+91 98765 43210" }))).toMatchObject({
      success: true,
      data: { phone: "+919876543210" },
    });
  });

  it("rejects email addresses that only look like addresses", () => {
    for (const email of ["owner@", "owner@example", "owner@.com", "owner example@test.com", "owner@example..com"]) {
      expect(parseLeadForm(form({ ...valid, email })), email).toMatchObject({ success: false, field: "email" });
    }
  });

  it("requires a business type from the published list", () => {
    expect(parseLeadForm(form({ ...valid, businessType: "" }))).toMatchObject({
      success: false,
      field: "businessType",
      message: "Choose the kind of business you run.",
    });
    expect(parseLeadForm(form({ ...valid, businessType: "space-station" })).success).toBe(false);
  });
});

describe("leadValuesFrom", () => {
  it("returns every field as a string so a failed submit can refill the form", () => {
    expect(leadValuesFrom(form({ name: "Riley", email: "riley@example.com" }))).toEqual({
      name: "Riley",
      businessName: "",
      email: "riley@example.com",
      phone: "",
      phoneCountry: "",
      businessType: "",
      message: "",
    });
  });

  it("keeps the country the visitor chose", () => {
    expect(leadValuesFrom(form({ ...valid, phoneCountry: "GB" }))).toMatchObject({ phoneCountry: "GB", phone: " 98765 43210 " });
  });

  it("caps what is sent back to the browser", () => {
    const values = leadValuesFrom(form({ ...valid, message: "x".repeat(5000) }));
    expect(values.message).toHaveLength(1200);
  });
});

describe("isHoneypotFilled", () => {
  it("is false for a form a person filled in", () => {
    expect(isHoneypotFilled(form(valid))).toBe(false);
    expect(isHoneypotFilled(form({ ...valid, website: "   " }))).toBe(false);
  });

  it("is true once the hidden field has anything in it", () => {
    expect(isHoneypotFilled(form({ ...valid, website: "https://spam.example" }))).toBe(true);
  });
});
