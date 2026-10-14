import { describe, expect, it } from "vitest";
import {
  LISTING_ABOUT_MAX_LENGTH,
  LISTING_TAGLINE_MAX_LENGTH,
  LISTING_TAG_LIMIT,
  containsContactDetails,
  parseAboutForm,
  parseButtonsForm,
  parseTaglineForm,
  parseTagsForm,
  parseVisibleForm,
} from "./listing-content";

function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe("containsContactDetails", () => {
  it.each([
    "Visit https://example.com",
    "see www.example.in",
    "smiledental.in for more",
    "write to hello@example.com",
    "Call +91 98200 12345",
    "call 9820012345",
    "Call 9820012345",
    "98200 12345",
    "+91-98200-12345",
    "022 2534 5678",
    "(022) 25345678",
    "25345678",
    "Call 25345678",
    "smiledental.in",
    "example.com",
    "bit.ly/abc",
    "t.me/x",
    "instagram.com/smile",
    "wa.me/919000000000",
    "98200-12345",
    "022-25345678",
  ])("flags %s", (text) => {
    expect(containsContactDetails(text)).toBe(true);
  });

  it.each([
    "Open 10 am - 9 pm",
    "Since 1998",
    "Root canals, braces and kids' care",
    "24x7 emergency",
    "500 - 1500",
    "₹500 - 1500",
    "Fees ₹25000 - 50000",
    "Rooms from 1200 - 2500",
    "1998 - 2024",
    "Since 1998 - 2024",
    "Pin 400601",
    "Tuition for B.Com and M.Com",
    "CA, M.Com",
    "Best clinic.In Thane",
    "B.Sc/M.Sc tuition",
    "B.Com/M.Com classes",
    "B.Ed/D.Ed",
    "M.Tech/B.Tech",
    "Timings 10.00-13.00, 17.00-21.00",
    "Fees 1500-2500",
    "1998-2024",
  ])("allows %s", (text) => {
    expect(containsContactDetails(text)).toBe(false);
  });
});

describe("parseTaglineForm", () => {
  it("cleans one line and keeps the colour", () => {
    expect(parseTaglineForm(form([["tagline", "  Gentle dentistry  "], ["colour", "sage"]]))).toEqual({
      success: true,
      data: { tagline: "Gentle dentistry", taglineColour: "sage" },
    });
  });

  it("treats an empty line as removing the card, keeping the colour", () => {
    expect(parseTaglineForm(form([["tagline", " "], ["colour", "ink"]]))).toEqual({
      success: true,
      data: { tagline: null, taglineColour: "ink" },
    });
  });

  it("refuses a line break, too long, contact details or an unknown colour", () => {
    expect(parseTaglineForm(form([["tagline", "a\nb"], ["colour", "rose"]]))).toMatchObject({ success: false, field: "tagline" });
    expect(parseTaglineForm(form([["tagline", "a".repeat(LISTING_TAGLINE_MAX_LENGTH + 1)], ["colour", "rose"]]))).toMatchObject({
      success: false,
      field: "tagline",
    });
    expect(parseTaglineForm(form([["tagline", "Call 9820012345"], ["colour", "rose"]]))).toMatchObject({ success: false, field: "tagline" });
    expect(parseTaglineForm(form([["tagline", "Hello"], ["colour", "neon"]]))).toMatchObject({ success: false, field: "colour" });
  });
});

describe("parseAboutForm", () => {
  it("cleans and accepts one line", () => {
    expect(parseAboutForm(form([["about", "  Gentle family dentistry.  "]]))).toEqual({
      success: true,
      data: { about: "Gentle family dentistry." },
    });
  });

  it("treats an empty field as clearing it", () => {
    expect(parseAboutForm(form([["about", "   "]]))).toEqual({ success: true, data: { about: null } });
  });

  it("refuses a line break, too long, or contact details", () => {
    expect(parseAboutForm(form([["about", "one\ntwo"]]))).toMatchObject({ success: false, field: "about" });
    expect(parseAboutForm(form([["about", "a".repeat(LISTING_ABOUT_MAX_LENGTH + 1)]]))).toMatchObject({
      success: false,
      field: "about",
    });
    expect(parseAboutForm(form([["about", "Call 9820012345"]]))).toMatchObject({
      success: false,
      field: "about",
      message: expect.stringMatching(/web addresses/i),
    });
  });
});

describe("parseTagsForm", () => {
  it("keeps order, trims, drops empties and case-insensitive duplicates", () => {
    const result = parseTagsForm(form([["tag", " Braces "], ["tag", ""], ["tag", "braces"], ["tag", "Root canal"]]));
    expect(result).toEqual({ success: true, data: { tags: ["Braces", "Root canal"] } });
  });

  it("refuses too many, too long, or contact details", () => {
    const many = Array.from({ length: LISTING_TAG_LIMIT + 1 }, (_, index) => ["tag", `Service ${index}`] as const);
    expect(parseTagsForm(form(many))).toMatchObject({ success: false, field: "tag" });
    expect(parseTagsForm(form([["tag", "x".repeat(33)]]))).toMatchObject({ success: false, field: "tag" });
    expect(parseTagsForm(form([["tag", "www.spam.com"]]))).toMatchObject({ success: false, field: "tag" });
  });
});

describe("parseButtonsForm", () => {
  it("reads each switch; missing means off", () => {
    expect(parseButtonsForm(form([["call", "on"], ["directions", "on"]]))).toEqual({
      success: true,
      data: { call: true, whatsapp: false, book: false, directions: true, website: false },
    });
  });
});

describe("parseVisibleForm", () => {
  it("accepts on and off only", () => {
    expect(parseVisibleForm(form([["visible", "on"]]))).toEqual({ success: true, data: { visible: true } });
    expect(parseVisibleForm(form([["visible", "off"]]))).toEqual({ success: true, data: { visible: false } });
    expect(parseVisibleForm(form([["visible", "maybe"]]))).toMatchObject({ success: false });
  });
});
