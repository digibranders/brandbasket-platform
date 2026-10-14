import { describe, expect, it, vi } from "vitest";
import type { BookingFields } from "./booking-form";

// booking-form.ts imports validation/phone.ts, which is marked "server-only" and throws if imported directly
// under plain Node (as this test file otherwise would); stub it out the same way phone.test.ts does, and import
// the module under test dynamically afterwards so the mock is in place first.
vi.mock("server-only", () => ({}));

const { bookingFieldsSchema, isBookingHoneypotFilled, normalisePhone, parseBookingFields, phoneHint } =
  await import("./booking-form");

const valid: BookingFields = {
  name: " Priya Sharma ",
  phone: " 98765 43210 ",
  serviceId: "5b6a7c8d-1234-4a2b-9c3d-4e5f6a7b8c9d",
  date: "2026-10-05",
  start: "09:00",
};

describe("bookingFieldsSchema", () => {
  it("accepts the shape the client site posts", () => {
    expect(bookingFieldsSchema.safeParse(valid).success).toBe(true);
  });

  it("caps every raw string at 2000 characters", () => {
    expect(bookingFieldsSchema.safeParse({ ...valid, practitionerId: "x".repeat(2001) }).success).toBe(false);
    expect(bookingFieldsSchema.safeParse({ ...valid, name: "x".repeat(2001) }).success).toBe(false);
    expect(bookingFieldsSchema.safeParse({ ...valid, serviceId: "x".repeat(2001) }).success).toBe(false);
  });

  it("allows the optional fields to be missing", () => {
    const { serviceId: _serviceId, website: _website, ...required } = valid;
    expect(bookingFieldsSchema.safeParse(required).success).toBe(true);
  });

  it("drops an email or note an older client site still sends, since the booking no longer collects them", () => {
    const parsed = bookingFieldsSchema.safeParse({ ...valid, email: "priya@example.com", note: "First visit" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("email");
    expect(parsed.data).not.toHaveProperty("note");
  });
});

describe("the notice version a booking carries", () => {
  it("is accepted on the shape the client site posts, up to 40 characters", () => {
    expect(bookingFieldsSchema.safeParse({ ...valid, noticeVersion: "pre-dpdp" }).success).toBe(true);
    expect(bookingFieldsSchema.safeParse({ ...valid, noticeVersion: "v".repeat(41) }).success).toBe(false);
  });

  it("is kept, trimmed, when given, and left out when blank or missing", () => {
    expect(parseBookingFields({ ...valid, noticeVersion: " pre-dpdp " })).toMatchObject({ success: true, data: { noticeVersion: "pre-dpdp" } });
    for (const noticeVersion of ["", "   ", null, undefined]) {
      const parsed = parseBookingFields({ ...valid, noticeVersion });
      expect(parsed.success && "noticeVersion" in parsed.data).toBe(false);
    }
  });
});

describe("parseBookingFields", () => {
  it("trims and normalizes a valid booking", () => {
    expect(parseBookingFields(valid)).toEqual({
      success: true,
      data: {
        name: "Priya Sharma",
        phone: "+919876543210",
        serviceId: "5b6a7c8d-1234-4a2b-9c3d-4e5f6a7b8c9d",
        date: "2026-10-05",
        start: "09:00",
        practitionerId: null,
      },
    });
  });

  it("accepts a uuidv7 serviceId", () => {
    expect(parseBookingFields({ ...valid, serviceId: "01923a4e-7b3a-7c3e-8f3a-1234567890ab" })).toMatchObject({
      success: true,
      data: { serviceId: "01923a4e-7b3a-7c3e-8f3a-1234567890ab" },
    });
  });

  it("strips a stray control character from the name instead of rejecting it", () => {
    expect(parseBookingFields({ ...valid, name: "Priya\u0000 Sharma" })).toMatchObject({
      success: true,
      data: { name: "Priya Sharma" },
    });
  });

  it("squashes a carriage-return/line-feed in the name into a space rather than rejecting it", () => {
    expect(parseBookingFields({ ...valid, name: "Priya\r\nSharma" })).toMatchObject({
      success: true,
      data: { name: "Priya Sharma" },
    });
  });

  it("treats blank optional fields as null", () => {
    const result = parseBookingFields({ ...valid, serviceId: "  " });
    expect(result).toMatchObject({ success: true, data: { serviceId: null } });
  });

  it("treats missing optional fields as null", () => {
    const { serviceId: _serviceId, ...required } = valid;
    const result = parseBookingFields(required);
    expect(result).toMatchObject({ success: true, data: { serviceId: null } });
  });

  it("requires a non-empty name, with its own message", () => {
    expect(parseBookingFields({ ...valid, name: "  " })).toMatchObject({
      success: false,
      field: "name",
      message: "Enter your name.",
    });
  });

  it("caps the name at 80 characters, with a message naming the limit", () => {
    expect(parseBookingFields({ ...valid, name: "x".repeat(81) })).toMatchObject({
      success: false,
      field: "name",
      message: "Keep your name to 80 characters.",
    });
    expect(parseBookingFields({ ...valid, name: "x".repeat(80) })).toMatchObject({ success: true });
  });

  it("requires a phone number normalisePhone can turn into E.164", () => {
    expect(parseBookingFields({ ...valid, phone: "123" })).toMatchObject({
      success: false,
      field: "phone",
      message: "Enter a phone number we can text, like +91 98765 43210.",
    });
    expect(parseBookingFields({ ...valid, phone: "call me maybe" })).toMatchObject({
      success: false,
      field: "phone",
    });
  });

  it("accepts phone punctuation people actually type", () => {
    expect(parseBookingFields({ ...valid, phone: "+1 (212) 555-0100" })).toMatchObject({
      success: true,
      data: { phone: "+12125550100" },
    });
  });

  it("rejects a serviceId that is not a uuid", () => {
    expect(parseBookingFields({ ...valid, serviceId: "not-a-uuid" })).toMatchObject({
      success: false,
      field: "serviceId",
      message: "Choose a service from the list.",
    });
  });

  it("keeps a chosen doctor's uuid, trimmed", () => {
    expect(parseBookingFields({ ...valid, practitionerId: " 01923a4e-7b3a-7c3e-8f3a-1234567890ab " })).toMatchObject({
      success: true,
      data: { practitionerId: "01923a4e-7b3a-7c3e-8f3a-1234567890ab" },
    });
  });

  it("reads a blank, null or missing practitionerId as any doctor", () => {
    expect(parseBookingFields({ ...valid, practitionerId: "  " })).toMatchObject({ success: true, data: { practitionerId: null } });
    expect(parseBookingFields({ ...valid, practitionerId: null })).toMatchObject({ success: true, data: { practitionerId: null } });
    expect(parseBookingFields(valid)).toMatchObject({ success: true, data: { practitionerId: null } });
  });

  it("rejects a practitionerId that is not a uuid", () => {
    expect(parseBookingFields({ ...valid, practitionerId: "dr-mehta" })).toEqual({
      success: false,
      field: "practitionerId",
      message: "Choose a doctor from the list.",
    });
  });

  it("requires an ISO date", () => {
    expect(parseBookingFields({ ...valid, date: "next tuesday" })).toMatchObject({
      success: false,
      field: "date",
      message: "Choose a date.",
    });
  });

  it("requires an HH:MM start time within 00:00-23:59", () => {
    expect(parseBookingFields({ ...valid, start: "9am" })).toMatchObject({
      success: false,
      field: "start",
      message: "Choose a time.",
    });
    expect(parseBookingFields({ ...valid, start: "24:00" })).toMatchObject({ success: false, field: "start" });
    expect(parseBookingFields({ ...valid, start: "9:00" })).toMatchObject({ success: false, field: "start" });
  });

  it("accepts the edges of the valid start-time range", () => {
    expect(parseBookingFields({ ...valid, start: "00:00" })).toMatchObject({ success: true, data: { start: "00:00" } });
    expect(parseBookingFields({ ...valid, start: "23:59" })).toMatchObject({ success: true, data: { start: "23:59" } });
  });

  it("checks fields in order and reports the first failure", () => {
    expect(parseBookingFields({ ...valid, name: "", phone: "" })).toMatchObject({ field: "name" });
    expect(parseBookingFields({ ...valid, phone: "", serviceId: "bad" })).toMatchObject({ field: "phone" });
  });
});

describe("normalisePhone", () => {
  it("defaults a 10-digit number to +91", () => {
    expect(normalisePhone("9876543210")).toBe("+919876543210");
  });

  it("strips spaces, dashes, dots and brackets before reading digits", () => {
    expect(normalisePhone("98765 43210")).toBe("+919876543210");
    expect(normalisePhone("98765-43210")).toBe("+919876543210");
    expect(normalisePhone("(98765).43210")).toBe("+919876543210");
    expect(normalisePhone("+1 (212) 555.0100")).toBe("+12125550100");
  });

  it("keeps a leading + and its country code as typed", () => {
    expect(normalisePhone("+442071838750")).toBe("+442071838750");
    expect(normalisePhone("+91 98765 43210")).toBe("+919876543210");
  });

  it("turns a leading 00 into a +", () => {
    expect(normalisePhone("00442071838750")).toBe("+442071838750");
  });

  it("drops a leading trunk 0 from an 11-digit number and prepends the default country code", () => {
    expect(normalisePhone("09876543210")).toBe("+919876543210");
  });

  it("accepts a number that already carries the country code but no +", () => {
    // libphonenumber-js recognises this as a valid Indian mobile number even without the "+", since a "9" opener
    // right after "91" isn't a plausible start of a longer national number.
    expect(normalisePhone("919876543210")).toBe("+919876543210");
  });

  it("rejects a 10-digit number that starts with 0, unlike the 11-digit trunk-prefixed form above", () => {
    // "0987654321" isn't "0" plus a real 10-digit number (that would be 11 digits); it's just not a valid Indian
    // number, and E.164 can never start with "0" regardless.
    expect(normalisePhone("0987654321")).toBeNull();
  });

  it("uses the given default country code instead of 91 when one is passed", () => {
    expect(normalisePhone("2025550100", "1")).toBe("+12025550100");
  });

  it("returns null for a default country code with no region on file", () => {
    expect(normalisePhone("2025550100", "999")).toBeNull();
  });

  it("rejects an 8-15 digit number with no + that isn't a real number for the default region, since the country can't be guessed", () => {
    expect(normalisePhone("442071838750")).toBeNull(); // 12 digits, no +, doesn't start with 0
    expect(normalisePhone("12345678")).toBeNull(); // 8 digits, not 10
  });

  it("rejects a number that is too short or too long even with a +", () => {
    expect(normalisePhone("+1234")).toBeNull(); // 4 digits after +, below the 8-digit floor
    expect(normalisePhone(`+${"1".repeat(16)}`)).toBeNull(); // 16 digits after +, above the 15-digit ceiling
  });

  it("rejects letters and other non-numeric characters", () => {
    expect(normalisePhone("call me maybe")).toBeNull();
    expect(normalisePhone("98765x43210")).toBeNull();
  });

  it("rejects an empty or whitespace-only value", () => {
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone("   ")).toBeNull();
  });

  it("always returns a value matching the E.164 shape the database enforces", () => {
    for (const raw of ["9876543210", "+919876543210", "09876543210", "919876543210", "0044 20 7183 8750"]) {
      expect(normalisePhone(raw)).toMatch(/^\+[0-9]{8,15}$/);
    }
  });
});

describe("isBookingHoneypotFilled", () => {
  it("is false when the honeypot is empty or missing", () => {
    expect(isBookingHoneypotFilled(valid)).toBe(false);
    expect(isBookingHoneypotFilled({ ...valid, website: "   " })).toBe(false);
  });

  it("is true once the honeypot has anything in it", () => {
    expect(isBookingHoneypotFilled({ ...valid, website: "https://spam.example" })).toBe(true);
  });
});

describe("phoneHint", () => {
  it("shows only the last 4 digits", () => {
    expect(phoneHint("+919876543210")).toBe("•••• 3210");
  });
});
