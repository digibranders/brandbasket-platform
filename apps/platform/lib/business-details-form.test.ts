import { describe, expect, it, vi } from "vitest";
import { BUSINESS_ABOUT_MAX_LENGTH, BUSINESS_ABOUT_MAX_WORDS, countWords, limitWords, WHATSAPP_SAME_VALUE } from "./business-details-fields";
import { OWNER_FORM_FIELDS_MESSAGE } from "./owner-form";

vi.mock("server-only", () => ({}));

const { parseBusinessDetailsForm } = await import("./business-details-form");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const valid = {
  businessName: "  Gentle Dental ",
  address: " 12 Gokhale Road,\nnear Thane station ",
  phone: "98200 77001",
  whatsappSame: WHATSAPP_SAME_VALUE,
  whatsapp: "",
  maps: "https://www.google.com/maps/@19.1943,72.9706,17z",
  website: "gentledental.in",
  about: "  Family dentist since 2004.  ",
};

describe("parseBusinessDetailsForm", () => {
  it("returns the cleaned details, the name's slug, numbers in E.164 and the map pin", () => {
    expect(parseBusinessDetailsForm(form(valid))).toEqual({
      success: true,
      data: {
        businessName: "Gentle Dental",
        slug: "gentle-dental",
        streetAddress: "12 Gokhale Road, near Thane station",
        phone: "+919820077001",
        whatsapp: "+919820077001",
        mapsUrl: "https://www.google.com/maps/@19.1943,72.9706,17z",
        pin: { latitude: 19.1943, longitude: 72.9706 },
        websiteUrl: "https://gentledental.in/",
        about: "Family dentist since 2004.",
        directionsNote: null,
        email: null,
        gstNumber: null,
        instagramUrl: null,
        facebookUrl: null,
        linkedinUrl: null,
        establishedYear: null,
        serviceArea: null,
        holidayHours: null,
        open24x7: false,
        hours: [],
      },
    });
  });

  it("reads the identity extras: email, social links, year, service area, holiday hours and 24x7", () => {
    const parsed = parseBusinessDetailsForm(
      form({
        ...valid,
        directionsNote: "  Opposite the post office ",
        email: " Hello@GentleDental.in ",
        instagram: "instagram.com/gentledental",
        facebook: "https://www.facebook.com/gentledental",
        linkedin: "",
        establishedYear: "2004",
        serviceArea: "Thane and Mumbra",
        holidayHours: "Closed on Diwali",
        open24x7: "yes",
      }),
      new Date("2026-10-06T00:00:00.000Z"),
    );
    expect(parsed).toMatchObject({
      success: true,
      data: {
        directionsNote: "Opposite the post office",
        email: "hello@gentledental.in",
        gstNumber: null,
        instagramUrl: "https://instagram.com/gentledental",
        facebookUrl: "https://www.facebook.com/gentledental",
        linkedinUrl: null,
        establishedYear: 2004,
        serviceArea: "Thane and Mumbra",
        holidayHours: "Closed on Diwali",
        open24x7: true,
      },
    });
  });

  it("refuses a bad email, a social link from another site and a founding year out of range", () => {
    const now = new Date("2026-10-06T00:00:00.000Z");
    expect(parseBusinessDetailsForm(form({ ...valid, email: "not-an-email" }), now)).toMatchObject({ success: false, field: "email" });
    expect(parseBusinessDetailsForm(form({ ...valid, instagram: "facebook.com/gentle" }), now)).toMatchObject({ success: false, field: "instagram" });
    expect(parseBusinessDetailsForm(form({ ...valid, establishedYear: "2027" }), now)).toMatchObject({ success: false, field: "establishedYear" });
    expect(parseBusinessDetailsForm(form({ ...valid, establishedYear: "1750" }), now)).toMatchObject({ success: false, field: "establishedYear" });
    expect(parseBusinessDetailsForm(form({ ...valid, establishedYear: "abcd" }), now)).toMatchObject({ success: false, field: "establishedYear" });
    expect(parseBusinessDetailsForm(form({ ...valid, serviceArea: "x".repeat(201) }), now)).toMatchObject({ success: false, field: "serviceArea" });
  });

  it("takes a different WhatsApp number, or none, when Same as phone is not ticked", () => {
    const own = parseBusinessDetailsForm(form({ ...valid, whatsappSame: "", whatsapp: "98200 77002" }));
    expect(own).toMatchObject({ success: true, data: { whatsapp: "+919820077002" } });
    const none = parseBusinessDetailsForm(form({ ...valid, whatsappSame: "", whatsapp: "" }));
    expect(none).toMatchObject({ success: true, data: { whatsapp: null } });
  });

  it("leaves the optional details out when their boxes are empty", () => {
    expect(parseBusinessDetailsForm(form({ ...valid, maps: "", website: "", about: " " }))).toMatchObject({
      success: true,
      data: { mapsUrl: null, pin: null, websiteUrl: null, about: null },
    });
  });

  it("takes an optional GST number, in any case and with spaces, and refuses one that is not a GSTIN", () => {
    expect(parseBusinessDetailsForm(form(valid))).toMatchObject({ success: true, data: { gstNumber: null } });
    expect(parseBusinessDetailsForm(form({ ...valid, gstNumber: " 27aapfu 0939f1zv " }))).toMatchObject({
      success: true,
      data: { gstNumber: "27AAPFU0939F1ZV" },
    });
    expect(parseBusinessDetailsForm(form({ ...valid, gstNumber: "27AAPFU0939F1ZX" }))).toMatchObject({ success: false, field: "gstNumber" });
    expect(parseBusinessDetailsForm(form({ ...valid, gstNumber: "12345" }))).toMatchObject({ success: false, field: "gstNumber" });
  });

  it("cuts a longer description to the word limit, and to the character limit, instead of refusing it", () => {
    const over = Array.from({ length: BUSINESS_ABOUT_MAX_WORDS + 40 }, (_, index) => `w${String(index)}`).join(" ");
    const cut = parseBusinessDetailsForm(form({ ...valid, about: over }));
    expect(cut.success && countWords(cut.data.about ?? "")).toBe(BUSINESS_ABOUT_MAX_WORDS);
    expect(cut.success && cut.data.about?.endsWith(`w${String(BUSINESS_ABOUT_MAX_WORDS - 1)}`)).toBe(true);

    const long = parseBusinessDetailsForm(form({ ...valid, about: "a".repeat(BUSINESS_ABOUT_MAX_LENGTH + 500) }));
    expect(long.success && (long.data.about ?? "").length).toBe(BUSINESS_ABOUT_MAX_LENGTH);
  });

  it("takes a description of exactly the word limit and counts words, not characters", () => {
    const atLimit = Array.from({ length: BUSINESS_ABOUT_MAX_WORDS }, () => "word").join(" ");
    expect(parseBusinessDetailsForm(form({ ...valid, about: atLimit }))).toMatchObject({ success: true, data: { about: atLimit } });
  });

  it("counts and trims words", () => {
    expect(countWords("  one two\nthree  ")).toBe(3);
    expect(countWords(" ")).toBe(0);
    expect(limitWords("one two\nthree four", 3)).toBe("one two\nthree");
    expect(limitWords("one two", 3)).toBe("one two");
  });

  it("reads opening hours as the hours editor posts them", () => {
    const parsed = parseBusinessDetailsForm(
      form({ ...valid, "hours.0.mode": "open", "hours.0.opens": "09:00", "hours.0.closes": "18:00", "hours.6.mode": "closed" }),
    );
    expect(parsed).toMatchObject({
      success: true,
      data: {
        hours: [
          { dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "18:00" },
          { dayOfWeek: 6, mode: "closed" },
        ],
      },
    });
  });

  it("names the box that is wrong", () => {
    expect(parseBusinessDetailsForm(form({ ...valid, businessName: " " }))).toMatchObject({ success: false, field: "businessName" });
    expect(parseBusinessDetailsForm(form({ ...valid, address: "" }))).toMatchObject({ success: false, field: "address" });
    expect(parseBusinessDetailsForm(form({ ...valid, phone: "" }))).toMatchObject({ success: false, field: "phone" });
    expect(parseBusinessDetailsForm(form({ ...valid, phone: "12" }))).toMatchObject({ success: false, field: "phone" });
    expect(parseBusinessDetailsForm(form({ ...valid, whatsappSame: "", whatsapp: "12" }))).toMatchObject({ success: false, field: "whatsapp" });
    expect(parseBusinessDetailsForm(form({ ...valid, maps: "https://example.com" }))).toMatchObject({ success: false, field: "maps" });
    expect(parseBusinessDetailsForm(form({ ...valid, website: "not a site" }))).toMatchObject({ success: false, field: "website" });
    expect(parseBusinessDetailsForm(form({ ...valid, "hours.1.mode": "open", "hours.1.opens": "", "hours.1.closes": "" }))).toMatchObject({
      success: false,
      field: expect.stringMatching(/^hours\.1\./) as unknown,
    });
  });

  it("refuses a form that sends a field it does not show", () => {
    expect(parseBusinessDetailsForm(form({ ...valid, slug: "someone-elses-page" }))).toEqual({
      success: false,
      field: null,
      message: OWNER_FORM_FIELDS_MESSAGE,
    });
  });
});

describe("parseBusinessDetailsForm for a claimed business", () => {
  const claimedForm = (fields: Record<string, string>) => form(Object.fromEntries(Object.entries({ ...valid, ...fields }).filter(([key]) => key !== "address" && key !== "maps")));

  it("asks for no address, keeps none, and still takes the rest of the profile", () => {
    const parsed = parseBusinessDetailsForm(claimedForm({}), new Date(), { claimed: true });
    expect(parsed).toMatchObject({ success: true, data: { streetAddress: "", about: "Family dentist since 2004.", mapsUrl: null, pin: null } });
  });

  it("ignores an address typed anyway, since the directory's is the one that shows", () => {
    expect(parseBusinessDetailsForm(form({ ...valid, address: "Somewhere else entirely" }), new Date(), { claimed: true })).toMatchObject({
      success: true,
      data: { streetAddress: "" },
    });
  });

  it("still needs an address for any other business", () => {
    expect(parseBusinessDetailsForm(claimedForm({}))).toMatchObject({ success: false, field: "address" });
  });
});
