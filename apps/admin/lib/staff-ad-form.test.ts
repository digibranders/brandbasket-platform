import { describe, expect, it, vi } from "vitest";
import { parseStaffAdEdit, parseStaffAdForm, staffAdEditValuesFrom, staffAdValuesFrom, STAFF_AD_SPOTS, type StaffAdEditValues, type StaffAdValues } from "./staff-ad-form";

vi.mock("server-only", () => ({}));

const BASE: StaffAdValues = {
  kind: "business",
  link: "",
  listing: "https://firstfold.io/in/beauty-salons/mh/thane/vartak-nagar/glow-salon?ref=x",
  businessName: "  Glow Salon ",
  tagline: "Bridal  packages",
  category: "dentists",
  area: "thane/naupada",
  spot: "side:2",
  fromWeek: "2026-10-05",
  weeks: "3",
  price: "1,500",
  note: " Paid by UPI ",
};

describe("parseStaffAdForm", () => {
  it("reads a placement in a market of staff's choosing, not the business's own", () => {
    expect(parseStaffAdForm(BASE)).toEqual({
      success: true,
      data: {
        listingKey: "beauty-salons/thane/vartak-nagar/glow-salon",
        linkUrl: null,
        businessName: "Glow Salon",
        tagline: "Bridal packages",
        market: { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" },
        placement: "side",
        spot: 2,
        fromWeek: "2026-10-05",
        weeks: 3,
        agreedPaise: 150_000,
        note: "Paid by UPI",
      },
    });
  });

  it("uses the business's own category and area when those are left blank, and keeps optional fields empty", () => {
    const parsed = parseStaffAdForm({ ...BASE, category: "", area: "", tagline: "", price: "", note: "", spot: "profile:1" });
    expect(parsed).toMatchObject({
      success: true,
      data: {
        market: { categorySlug: "beauty-salons", citySlug: "thane", areaSlug: "vartak-nagar" },
        placement: "profile",
        spot: 1,
        tagline: null,
        agreedPaise: null,
        note: null,
      },
    });
  });

  it.each([
    ["listing", { listing: "" }],
    ["listing", { listing: "https://firstfold.io/in/beauty-salons/mh/thane" }],
    ["businessName", { businessName: "   " }],
    ["tagline", { tagline: "x".repeat(81) }],
    ["category", { category: "not-a-category" }],
    ["area", { area: "thane/nowhere" }],
    ["spot", { spot: "side:3" }],
    ["fromWeek", { fromWeek: "2026-10-06" }],
    ["weeks", { weeks: "0" }],
    ["weeks", { weeks: "13" }],
    ["price", { price: "12.50" }],
    ["price", { price: "200000" }],
    ["note", { note: "n".repeat(201) }],
  ] as const)("points at %s when it is wrong", (field, change) => {
    expect(parseStaffAdForm({ ...BASE, ...change })).toMatchObject({ success: false, field });
  });

  it("takes ads only in a category with its own website page", () => {
    // Plumbers is a directory category, but it has no page yet: no business in it has reached five.
    expect(parseStaffAdForm({ ...BASE, category: "plumbers" })).toMatchObject({ success: false, field: "category" });
    const ownUnpublished = { ...BASE, listing: "https://firstfold.io/in/plumbers/mh/thane/vartak-nagar/sai-plumbing", category: "" };
    expect(parseStaffAdForm(ownUnpublished)).toMatchObject({
      success: false,
      field: "category",
      message: "This business's category has no page on the website yet. Choose one from the list.",
    });
  });

  it("can be for all categories, all areas of a city, or both", () => {
    const market = (overrides: Partial<StaffAdValues>) => {
      const parsed = parseStaffAdForm({ ...BASE, ...overrides });
      return parsed.success ? parsed.data.market : parsed;
    };
    expect(market({ category: "all" })).toEqual({ categorySlug: "all", citySlug: "thane", areaSlug: "naupada" });
    expect(market({ area: "thane/all" })).toEqual({ categorySlug: "dentists", citySlug: "thane", areaSlug: "all" });
    expect(market({ category: "all", area: "thane/all" })).toEqual({ categorySlug: "all", citySlug: "thane", areaSlug: "all" });
  });

  it("takes all areas of a real city only, and all categories only as 'all'", () => {
    expect(parseStaffAdForm({ ...BASE, area: "atlantis/all" })).toMatchObject({ success: false, field: "area" });
    expect(parseStaffAdForm({ ...BASE, area: "all" })).toMatchObject({ success: false, field: "area" });
    expect(parseStaffAdForm({ ...BASE, category: "all-things" })).toMatchObject({ success: false, field: "category" });
  });

  it("keeps the business's own area when only the category is all, and the business's own category when only the area is all", () => {
    const own = { ...BASE, listing: "https://firstfold.io/in/dentists/mh/thane/naupada/care-dental" };
    expect(parseStaffAdForm({ ...own, category: "all", area: "" })).toMatchObject({ success: true, data: { market: { categorySlug: "all", areaSlug: "naupada" } } });
    expect(parseStaffAdForm({ ...own, category: "", area: "thane/all" })).toMatchObject({ success: true, data: { market: { categorySlug: "dentists", areaSlug: "all" } } });
  });

  it("accepts a free placement recorded as ₹0", () => {
    expect(parseStaffAdForm({ ...BASE, price: "0" })).toMatchObject({ success: true, data: { agreedPaise: 0 } });
  });
});

describe("a link ad", () => {
  const LINK: StaffAdValues = { ...BASE, kind: "link", link: "example.com/offer", listing: "", businessName: " Free check-up camp ", tagline: "This Sunday", category: "dentists", area: "thane/naupada" };

  it("leads to the web address staff typed, with no business behind it, in the market staff chose", () => {
    expect(parseStaffAdForm(LINK)).toEqual({
      success: true,
      data: {
        listingKey: null,
        linkUrl: "https://example.com/offer",
        businessName: "Free check-up camp",
        tagline: "This Sunday",
        market: { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" },
        placement: "side",
        spot: 2,
        fromWeek: "2026-10-05",
        weeks: 3,
        agreedPaise: 150_000,
        note: "Paid by UPI",
      },
    });
  });

  it("needs no business page, but does need a headline and a real address", () => {
    expect(parseStaffAdForm({ ...LINK, listing: "not even a page" })).toMatchObject({ success: true });
    expect(parseStaffAdForm({ ...LINK, link: "" })).toMatchObject({ success: false, field: "link" });
    expect(parseStaffAdForm({ ...LINK, link: "javascript:alert(1)" })).toMatchObject({ success: false, field: "link" });
    expect(parseStaffAdForm({ ...LINK, businessName: "  " })).toEqual({ success: false, field: "businessName", message: "Enter the headline the ad should show." });
  });

  it("has no business whose category and area could stand in, so staff must choose them", () => {
    expect(parseStaffAdForm({ ...LINK, category: "" })).toMatchObject({ success: false, field: "category", message: "Choose a category from the list." });
    expect(parseStaffAdForm({ ...LINK, area: "" })).toMatchObject({ success: false, field: "area" });
    expect(parseStaffAdForm({ ...LINK, spot: "home:1", area: "" })).toMatchObject({ success: false, field: "area" });
    expect(parseStaffAdForm({ ...LINK, spot: "home:1", area: "thane" })).toMatchObject({ success: true, data: { market: { citySlug: "thane", areaSlug: "all" } } });
  });

  it("runs for a month or two: eight weeks is two months", () => {
    expect(parseStaffAdForm({ ...LINK, weeks: "8" })).toMatchObject({ success: true, data: { weeks: 8 } });
    expect(parseStaffAdForm({ ...LINK, weeks: "12" })).toMatchObject({ success: true, data: { weeks: 12 } });
  });
});

describe("spots by placement", () => {
  it("offers every placement with as many spots as it has", () => {
    expect(STAFF_AD_SPOTS.map((spot) => spot.value)).toEqual([
      "home:1",
      "home:2",
      "home:3",
      "home:4",
      "side:1",
      "side:2",
      "profile:1",
    ]);
    expect(STAFF_AD_SPOTS.find((spot) => spot.value === "home:2")?.label).toBe("Home page, tile 2");
    expect(STAFF_AD_SPOTS.find((spot) => spot.value === "profile:1")?.label).toBe("Business page");
  });

  it("places a business page ad in the chosen category and area", () => {
    expect(parseStaffAdForm({ ...BASE, spot: "profile:1" })).toMatchObject({
      success: true,
      data: { placement: "profile", spot: 1, market: { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" } },
    });
  });

  it("places a home page ad in its city's home market, ignoring the category and area", () => {
    expect(parseStaffAdForm({ ...BASE, spot: "home:4", category: "dentists", area: "" })).toMatchObject({
      success: true,
      data: { placement: "home", spot: 4, market: { categorySlug: "all", citySlug: "thane", areaSlug: "all" } },
    });
  });

  it("takes the home page's city from a chosen city, or from a city/area value", () => {
    expect(parseStaffAdForm({ ...BASE, spot: "home:1", area: "thane" })).toMatchObject({ success: true, data: { market: { citySlug: "thane" } } });
    expect(parseStaffAdForm({ ...BASE, spot: "home:1", area: "thane/naupada" })).toMatchObject({ success: true, data: { market: { citySlug: "thane", areaSlug: "all" } } });
  });

  it("does not need a valid category for a home page ad, but refuses an unknown city", () => {
    const home = { ...BASE, spot: "home:1", category: "not-a-category" };
    expect(parseStaffAdForm({ ...home, area: "" })).toMatchObject({ success: true });
    expect(parseStaffAdForm({ ...home, area: "atlantis" })).toMatchObject({ success: false, field: "area" });
  });

  it.each([
    ["home:5", "Home page has spots 1 to 4."],
    ["home:0", "Home page has spots 1 to 4."],
    ["side:3", "Side spot has spots 1 to 2."],
    ["top:1", "Choose the spot."],
    ["profile:2", "Business page has one spot."],
    ["profile:1:1", "Choose the spot."],
    ["bogus:1", "Choose the spot."],
    ["", "Choose the spot."],
  ])("refuses the spot %s with a clear message", (spot, message) => {
    expect(parseStaffAdForm({ ...BASE, spot })).toEqual({ success: false, field: "spot", message });
  });
});

describe("staffAdValuesFrom", () => {
  it("reads missing and non-text fields as blank", () => {
    const values = staffAdValuesFrom((name) => (name === "weeks" ? "2" : name === "note" ? new Blob() : null));
    expect(values.weeks).toBe("2");
    expect(values.note).toBe("");
    expect(values.listing).toBe("");
  });
});

describe("parseStaffAdEdit", () => {
  const EDIT: StaffAdEditValues = { businessName: "  Glow Salon ", tagline: "Bridal  packages", link: "", price: "₹ 2,000", note: " Paid again " };

  it("reads what an ad for a business says and the team's own price and note, with no link", () => {
    expect(parseStaffAdEdit(EDIT, { isLink: false })).toEqual({
      success: true,
      data: { businessName: "Glow Salon", tagline: "Bridal packages", linkUrl: null, agreedPaise: 200_000, note: "Paid again" },
    });
  });

  it("ignores a link typed for an ad for a business, and needs a real one for a link ad", () => {
    expect(parseStaffAdEdit({ ...EDIT, link: "https://example.com/x" }, { isLink: false })).toMatchObject({ success: true, data: { linkUrl: null } });
    expect(parseStaffAdEdit({ ...EDIT, link: "https://example.com/new" }, { isLink: true })).toMatchObject({ success: true, data: { linkUrl: "https://example.com/new" } });
    expect(parseStaffAdEdit({ ...EDIT, link: "" }, { isLink: true })).toMatchObject({ success: false, field: "link" });
    expect(parseStaffAdEdit({ ...EDIT, link: "javascript:alert(1)" }, { isLink: true })).toMatchObject({ success: false, field: "link" });
  });

  it("keeps the same rules as placing the ad: a name, a short line, whole rupees, a short note", () => {
    expect(parseStaffAdEdit({ ...EDIT, businessName: " " }, { isLink: false })).toMatchObject({ success: false, field: "businessName" });
    expect(parseStaffAdEdit({ ...EDIT, link: "https://example.com/x", businessName: " " }, { isLink: true })).toMatchObject({ success: false, field: "businessName", message: "Enter the headline the ad should show." });
    expect(parseStaffAdEdit({ ...EDIT, price: "12.5" }, { isLink: false })).toMatchObject({ success: false, field: "price" });
    expect(parseStaffAdEdit({ ...EDIT, note: "x".repeat(201) }, { isLink: false })).toMatchObject({ success: false, field: "note" });
    expect(parseStaffAdEdit({ ...EDIT, price: "", note: "", tagline: "" }, { isLink: false })).toMatchObject({ success: true, data: { agreedPaise: null, note: null, tagline: null } });
  });

  it("reads missing and non-text fields as blank", () => {
    expect(staffAdEditValuesFrom((name) => (name === "price" ? 5 : name === "note" ? "n" : undefined))).toEqual({ businessName: "", tagline: "", link: "", price: "", note: "n" });
  });
});
