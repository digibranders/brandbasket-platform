import { describe, expect, it, vi } from "vitest";
import { WEEKDAYS } from "@brandbasket/shared/lib/onboarding/business-fields";

vi.mock("server-only", () => ({}));

const { GOOGLE_HOST_MESSAGE, GOOGLE_LINK_MESSAGE, parseBusinessForm, parseContactForm, parseHoursForm } = await import("./business-form");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** Monday to Friday nine to six, weekends closed. */
function weekHours(): Record<string, string> {
  const entries: Record<string, string> = {};
  WEEKDAYS.forEach((_, day) => {
    if (day >= 5) {
      entries[`hours.${day}.mode`] = "closed";
    } else {
      entries[`hours.${day}.mode`] = "open";
      entries[`hours.${day}.opens`] = "09:00";
      entries[`hours.${day}.closes`] = "18:00";
    }
  });
  return entries;
}

function parsedHours(entries: Record<string, string>) {
  const result = parseBusinessForm(form({ displayName: "Bloom Dental", ...entries }));
  if (!result.success) throw new Error(result.message);
  return result.data.hours;
}

const minimal = { displayName: " Bloom Dental ", ...weekHours() };

describe("parseBusinessForm", () => {
  it("accepts a name and hours, and turns every blank optional field into null", () => {
    const result = parseBusinessForm(form(minimal));
    expect(result).toMatchObject({
      success: true,
      data: {
        profile: { displayName: "Bloom Dental", tagline: null, phone: null, email: null, googleBusinessUrl: null },
      },
    });
  });

  it("stores no times for a closed day and both times for an open one", () => {
    const hours = parsedHours(weekHours());
    expect(hours).toHaveLength(7);
    expect(hours[0]).toEqual({ dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "18:00" });
    expect(hours[6]).toEqual({ dayOfWeek: 6, mode: "closed" });
  });

  it("saves nothing for a day left not set, so hours can be skipped entirely", () => {
    expect(parsedHours({})).toEqual([]);
    const blank = Object.fromEntries(WEEKDAYS.map((_, day) => [`hours.${day}.mode`, "unset"]));
    expect(parsedHours(blank)).toEqual([]);
    expect(parsedHours({ "hours.2.mode": "closed", "hours.3.mode": "unset", "hours.3.opens": "09:00" })).toEqual([
      { dayOfWeek: 2, mode: "closed" },
    ]);
  });

  it("keeps an overnight day, whose closing time comes before opening", () => {
    expect(parsedHours({ "hours.4.mode": "open", "hours.4.opens": "18:00", "hours.4.closes": "02:00" })).toEqual([
      { dayOfWeek: 4, mode: "open", opensAt: "18:00", closesAt: "02:00" },
    ]);
  });

  it("keeps a day open 24 hours, without times", () => {
    expect(parsedHours({ "hours.5.mode": "all-day", "hours.5.opens": "09:00", "hours.5.closes": "" })).toEqual([
      { dayOfWeek: 5, mode: "all-day" },
    ]);
  });

  it("ignores stray times on a day that is not open", () => {
    expect(parsedHours({ "hours.6.mode": "closed", "hours.6.opens": "10:00", "hours.6.closes": "10:00" })).toEqual([
      { dayOfWeek: 6, mode: "closed" },
    ]);
  });

  it("refuses equal times and points to Open 24 hours", () => {
    expect(
      parseBusinessForm(form({ ...minimal, "hours.1.opens": "00:00", "hours.1.closes": "00:00" })),
    ).toMatchObject({
      success: false,
      field: "hours.1.closes",
      message: "For round-the-clock opening, choose Open 24 hours.",
    });
  });

  it("refuses a day choice the editor does not offer", () => {
    expect(parseBusinessForm(form({ ...minimal, "hours.0.mode": "sometimes" }))).toMatchObject({
      success: false,
      field: "hours.0.mode",
    });
  });

  it("requires the business name", () => {
    expect(parseBusinessForm(form({ ...minimal, displayName: "  " }))).toMatchObject({
      success: false,
      field: "displayName",
    });
  });

  it("names the exact day and time that is wrong", () => {
    expect(parseBusinessForm(form({ ...minimal, "hours.2.opens": "" }))).toMatchObject({
      success: false,
      field: "hours.2.opens",
      message: "Add an opening time, or choose another option for this day.",
    });
    expect(parseBusinessForm(form({ ...minimal, "hours.3.closes": "" }))).toMatchObject({
      success: false,
      field: "hours.3.closes",
      message: "Add a closing time, or choose another option for this day.",
    });
    expect(parseBusinessForm(form({ ...minimal, "hours.1.opens": "25:00" }))).toMatchObject({
      field: "hours.1.opens",
    });
  });

  it("checks an optional phone or email only when one is given", () => {
    expect(
      parseBusinessForm(form({ ...minimal, phoneCountry: "IN", phone: "98765 43210", email: "Hi@Bloom.in" })),
    ).toMatchObject({
      success: true,
      data: { profile: { phone: "+919876543210", email: "hi@bloom.in" } },
    });
    expect(parseBusinessForm(form({ ...minimal, phoneCountry: "IN", phone: "call us" }))).toMatchObject({
      field: "phone",
      message: "Enter a valid phone number for India.",
    });
    expect(parseBusinessForm(form({ ...minimal, email: "hi@" }))).toMatchObject({ field: "email" });
  });

  it("needs a country only when a phone number is typed", () => {
    expect(parseBusinessForm(form({ ...minimal, phoneCountry: "", phone: "  " }))).toMatchObject({
      success: true,
      data: { profile: { phone: null } },
    });
    expect(parseBusinessForm(form({ ...minimal, phoneCountry: "ZZ", phone: "" }))).toMatchObject({
      success: true,
      data: { profile: { phone: null } },
    });
    expect(parseBusinessForm(form({ ...minimal, phoneCountry: "", phone: "98765 43210" }))).toMatchObject({
      success: false,
      field: "phoneCountry",
      message: "Choose your country code.",
    });
    expect(parseBusinessForm(form({ ...minimal, phoneCountry: "", phone: "+44 20 7946 0958" }))).toMatchObject({
      success: true,
      data: { profile: { phone: "+442079460958" } },
    });
  });

  it("asks for the country code when an international number is not valid", () => {
    expect(parseBusinessForm(form({ ...minimal, phoneCountry: "IN", phone: "+44 12" }))).toMatchObject({
      success: false,
      field: "phone",
      message: "Enter a valid phone number, including the country code.",
    });
  });

  it("only accepts a secure Google Business link", () => {
    expect(
      parseBusinessForm(form({ ...minimal, googleBusinessUrl: "https://g.page/bloom-dental" })),
    ).toMatchObject({ success: true, data: { profile: { googleBusinessUrl: "https://g.page/bloom-dental" } } });
    expect(parseBusinessForm(form({ ...minimal, googleBusinessUrl: "http://g.page/bloom" }))).toMatchObject({
      field: "googleBusinessUrl",
      message: GOOGLE_LINK_MESSAGE,
    });
    expect(parseBusinessForm(form({ ...minimal, googleBusinessUrl: "javascript:alert(1)" }))).toMatchObject({
      field: "googleBusinessUrl",
    });
  });

  it("stores the normalised link", () => {
    expect(
      parseBusinessForm(form({ ...minimal, googleBusinessUrl: " https://Maps.Google.com/?cid=123 " })),
    ).toMatchObject({ data: { profile: { googleBusinessUrl: "https://maps.google.com/?cid=123" } } });
    expect(parseBusinessForm(form({ ...minimal, googleBusinessUrl: "https://maps.app.goo.gl/AbC" }))).toMatchObject({
      data: { profile: { googleBusinessUrl: "https://maps.app.goo.gl/AbC" } },
    });
    expect(
      parseBusinessForm(form({ ...minimal, googleBusinessUrl: "https://business.google.com/n/123/profile" })),
    ).toMatchObject({ success: true });
  });

  it("accepts Google Maps place links", () => {
    for (const googleBusinessUrl of ["https://www.google.com/maps/place/Bloom+Dental"]) {
      expect(parseBusinessForm(form({ ...minimal, googleBusinessUrl })), googleBusinessUrl).toMatchObject({
        success: true,
        data: { profile: { googleBusinessUrl } },
      });
    }
  });

  it("refuses a link on any host but Google's, comparing whole labels", () => {
    for (const googleBusinessUrl of [
      "https://evilgoogle.com/maps",
      "https://google.com.evil.io/maps",
      "https://g.page.evil.io/x",
      "https://example.com/?u=https://g.page/x",
      "https://sites.google.com/view/riverside",
      "https://www.google.com/url?q=https://evil.example",
      "https://docs.google.com/maps",
      // The Google app's share links can point at any Search result, not only a business profile.
      "https://share.google/AbC123",
    ]) {
      expect(parseBusinessForm(form({ ...minimal, googleBusinessUrl })), googleBusinessUrl).toMatchObject({
        success: false,
        field: "googleBusinessUrl",
        message: GOOGLE_HOST_MESSAGE,
      });
    }
  });

  it("refuses a link over 500 characters", () => {
    const googleBusinessUrl = `https://g.page/${"a".repeat(500)}`;
    expect(parseBusinessForm(form({ ...minimal, googleBusinessUrl }))).toMatchObject({
      success: false,
      field: "googleBusinessUrl",
    });
  });

  it("keeps line breaks in the description and caps its length", () => {
    expect(parseBusinessForm(form({ ...minimal, description: "Family dentist.\r\nOpen late." }))).toMatchObject({
      data: { profile: { description: "Family dentist.\nOpen late." } },
    });
    expect(parseBusinessForm(form({ ...minimal, description: "x".repeat(601) }))).toMatchObject({
      field: "description",
    });
  });
});

describe("parseHoursForm", () => {
  it("parses hours the same way parseBusinessForm does, with no other field required", () => {
    const result = parseHoursForm(form(weekHours()));
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.message);
    expect(result.data).toHaveLength(7);
    expect(result.data[0]).toEqual({ dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "18:00" });
    expect(result.data[6]).toEqual({ dayOfWeek: 6, mode: "closed" });
  });

  it("saves nothing for a day left not set, so hours can be skipped entirely", () => {
    expect(parseHoursForm(form({}))).toEqual({ success: true, data: [] });
  });

  it("keeps an overnight day, whose closing time comes before opening", () => {
    const result = parseHoursForm(
      form({ "hours.4.mode": "open", "hours.4.opens": "18:00", "hours.4.closes": "02:00" }),
    );
    expect(result).toEqual({
      success: true,
      data: [{ dayOfWeek: 4, mode: "open", opensAt: "18:00", closesAt: "02:00" }],
    });
  });

  it("keeps a day open 24 hours, without times", () => {
    expect(parseHoursForm(form({ "hours.5.mode": "all-day" }))).toEqual({
      success: true,
      data: [{ dayOfWeek: 5, mode: "all-day" }],
    });
  });

  it("refuses equal times and points to Open 24 hours, naming the exact field", () => {
    expect(
      parseHoursForm(form({ "hours.1.mode": "open", "hours.1.opens": "00:00", "hours.1.closes": "00:00" })),
    ).toMatchObject({
      success: false,
      field: "hours.1.closes",
      message: "For round-the-clock opening, choose Open 24 hours.",
    });
  });

  it("refuses a missing opening time on an open day", () => {
    expect(parseHoursForm(form({ "hours.2.mode": "open", "hours.2.closes": "18:00" }))).toMatchObject({
      success: false,
      field: "hours.2.opens",
      message: "Add an opening time, or choose another option for this day.",
    });
  });

  it("refuses a day choice the editor does not offer", () => {
    expect(parseHoursForm(form({ "hours.0.mode": "sometimes" }))).toMatchObject({
      success: false,
      field: "hours.0.mode",
    });
  });

  it("ignores stray times on a day that is not open", () => {
    expect(
      parseHoursForm(form({ "hours.6.mode": "closed", "hours.6.opens": "10:00", "hours.6.closes": "10:00" })),
    ).toEqual({ success: true, data: [{ dayOfWeek: 6, mode: "closed" }] });
  });
});

describe("parseContactForm", () => {
  it("reads the contact facts, trims them, and turns a blank optional one into null", () => {
    const result = parseContactForm(
      form({ displayName: "  Bloom Dental ", phone: "", email: "hello@bloom.example", addressLine1: " 12 Market Road ", addressLine2: "", city: "Thane", region: "", postalCode: "400601", country: "India", serviceAreas: "Thane, Mumbai" }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        displayName: "Bloom Dental",
        phone: null,
        email: "hello@bloom.example",
        addressLine1: "12 Market Road",
        addressLine2: null,
        city: "Thane",
        region: null,
        postalCode: "400601",
        country: "India",
        serviceAreas: "Thane, Mumbai",
      },
    });
  });

  it("does not read, or return, the profile step's tagline, description, Google link or hours", () => {
    const result = parseContactForm(form({ displayName: "Bloom Dental", tagline: "Gentle", description: "Long text", googleBusinessUrl: "https://maps.app.goo.gl/x", ...weekHours() }));
    expect(result.success && Object.keys(result.data).sort()).toEqual(
      ["addressLine1", "addressLine2", "city", "country", "displayName", "email", "phone", "postalCode", "region", "serviceAreas"].sort(),
    );
  });

  it("asks for the business name, and names the field", () => {
    expect(parseContactForm(form({ displayName: "   " }))).toEqual({ success: false, message: "Tell us your business name.", field: "displayName" });
  });

  it("refuses an email that is not one, and a service area that is too long, naming the field", () => {
    expect(parseContactForm(form({ displayName: "Bloom Dental", email: "not-an-email" }))).toMatchObject({ success: false, field: "email" });
    expect(parseContactForm(form({ displayName: "Bloom Dental", serviceAreas: "x".repeat(301) }))).toEqual({
      success: false,
      message: "Keep the areas you serve to 300 characters.",
      field: "serviceAreas",
    });
  });
});
