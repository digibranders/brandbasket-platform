import { describe, expect, it, vi } from "vitest";
import {
  BUSINESS_NAME_MISSING_MESSAGE,
  BUSINESS_NAME_TOO_LONG_MESSAGE,
  directoryHref,
  LISTING_INVALID_MESSAGE,
  LISTING_MISSING_MESSAGE,
  listingKeyFromPageAddress,
  pageCount,
  parseDirectoryNotice,
  parseDirectoryView,
  parseListingKey,
  parseVerificationForm,
  verificationValuesFrom,
  type DirectoryView,
  type VerificationValues,
} from "./directory-view";

vi.mock("server-only", () => ({}));

const KEY = "restaurants/ambarnath/sarvodaya-nagar/golden-punjab-hotel";
const PAGE_PATH = "/in/restaurants/mh/ambarnath/sarvodaya-nagar/golden-punjab-hotel";

function viewOf(params: Record<string, string | string[] | undefined>): DirectoryView {
  return parseDirectoryView((name) => params[name]);
}

describe("parseDirectoryView", () => {
  it("defaults to the new enquiries, page 1", () => {
    expect(viewOf({})).toEqual({ section: "enquiries", status: "new", page: 1 });
  });

  it("reads each section's own filters and a page", () => {
    expect(viewOf({ status: "handled", page: "3" })).toEqual({ section: "enquiries", status: "handled", page: 3 });
    expect(viewOf({ show: "reviews", status: "hidden" })).toEqual({ section: "reviews", status: "hidden", page: 1 });
    expect(viewOf({ show: ["reviews", "enquiries"], status: "published", page: "2" })).toEqual({ section: "reviews", status: "published", page: 2 });
  });

  it("reads the comments section with the same filters as reviews", () => {
    expect(viewOf({ show: "comments" })).toEqual({ section: "comments", status: "all", page: 1 });
    expect(viewOf({ show: "comments", status: "hidden", page: "2" })).toEqual({ section: "comments", status: "hidden", page: 2 });
    expect(viewOf({ show: "comments", status: "new" })).toEqual({ section: "comments", status: "all", page: 1 });
  });

  it("reads the verified section with its search, ignoring a status", () => {
    expect(viewOf({ show: "verified", status: "hidden", q: "  Golden   Punjab ", page: "2" })).toEqual({
      section: "verified",
      search: "Golden   Punjab",
      page: 2,
    });
    expect(viewOf({ show: "verified" })).toEqual({ section: "verified", search: "", page: 1 });
    expect(viewOf({ show: "visitors", status: "hidden", q: "  Priya  ", page: "3" })).toEqual({ section: "visitors", search: "Priya", page: 3 });
    expect(viewOf({ show: "verified", q: "x".repeat(500) })).toMatchObject({ search: "x".repeat(200) });
    expect(viewOf({ show: "reviews", q: "golden" })).toEqual({ section: "reviews", status: "all", page: 1 });
  });

  it("falls back to defaults for anything it does not know", () => {
    expect(viewOf({ show: "photos", status: "hidden", page: "0" })).toEqual({ section: "enquiries", status: "new", page: 1 });
    expect(viewOf({ show: "reviews", status: "new", page: "1.5" })).toEqual({ section: "reviews", status: "all", page: 1 });
    expect(viewOf({ page: "99999999" }).page).toBe(10_000);
  });
});

describe("directoryHref", () => {
  it("leaves defaults out and round-trips through parseDirectoryView", () => {
    expect(directoryHref({ section: "enquiries", status: "new", page: 1 })).toBe("/directory");
    const views: DirectoryView[] = [
      { section: "enquiries", status: "handled", page: 2 },
      { section: "reviews", status: "all", page: 1 },
      { section: "reviews", status: "hidden", page: 4 },
      { section: "comments", status: "all", page: 1 },
      { section: "comments", status: "published", page: 3 },
      { section: "verified", search: "", page: 1 },
      { section: "verified", search: "Golden & Co 100%", page: 3 },
      { section: "visitors", search: "", page: 1 },
      { section: "visitors", search: "98765 43210", page: 2 },
    ];
    for (const view of views) {
      const params = new URL(directoryHref(view), "http://admin.localhost").searchParams;
      expect(parseDirectoryView((name) => params.get(name))).toEqual(view);
    }
  });

  it("adds a notice", () => {
    expect(directoryHref({ section: "reviews", status: "all", page: 1 }, "hidden")).toBe("/directory?show=reviews&done=hidden");
    expect(directoryHref({ section: "verified", search: "", page: 1 }, "verified")).toBe("/directory?show=verified&done=verified");
    expect(directoryHref({ section: "comments", status: "hidden", page: 1 }, "comment_hidden")).toBe(
      "/directory?show=comments&status=hidden&done=comment_hidden",
    );
  });
});

describe("parseDirectoryNotice and pageCount", () => {
  it("only knows the fixed notices", () => {
    expect(parseDirectoryNotice("restored")).toBe("restored");
    expect(parseDirectoryNotice("comment_restored")).toBe("comment_restored");
    expect(parseDirectoryNotice("trusted_given")).toBe("trusted_given");
    expect(parseDirectoryNotice("trusted_removed")).toBe("trusted_removed");
    expect(parseDirectoryNotice("constructor")).toBeNull();
    expect(parseDirectoryNotice(undefined)).toBeNull();
  });

  it("counts pages of 25, never fewer than one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25)).toBe(1);
    expect(pageCount(26)).toBe(2);
  });
});

describe("listingKeyFromPageAddress", () => {
  it.each([
    ["the full address", `https://fynix.digital${PAGE_PATH}`],
    ["a local address with a query, fragment and trailing slash", `http://localhost:3000${PAGE_PATH}/?sort=rating#reviews`],
    ["an upper-case scheme and host", `HTTPS://FYNIX.IO${PAGE_PATH}`],
    ["the bare path", PAGE_PATH],
    ["the path without its leading slash, with spaces around it", `  ${PAGE_PATH.slice(1)}  `],
    ["the path with a query", `${PAGE_PATH}?sort=rating`],
    ["the listing key itself", KEY],
  ])("reads %s", (_label, raw) => {
    expect(listingKeyFromPageAddress(raw)).toBe(KEY);
  });

  it.each([
    ["nothing", "   "],
    ["a list page", "https://fynix.digital/in/restaurants/mh/ambarnath/sarvodaya-nagar"],
    ["a city list page's address", "https://fynix.digital/in/restaurants/mh/ambarnath"],
    ["a city list page's path", "/in/restaurants/mh/ambarnath"],
    ["a city list page's path without its slash", "in/restaurants/mh/ambarnath"],
    ["a page outside the directory", "https://fynix.digital/blog/restaurants/mh/ambarnath/sarvodaya-nagar/golden-punjab-hotel"],
    ["another state", "https://fynix.digital/in/restaurants/ka/bengaluru/indiranagar/golden-punjab-hotel"],
    ["capital letters in the path", "/in/Restaurants/mh/ambarnath/sarvodaya-nagar/golden-punjab-hotel"],
    ["an encoded character", "/in/restaurants/mh/ambarnath/sarvodaya-nagar/golden%20punjab"],
    ["a doubled hyphen", "restaurants/ambarnath/sarvodaya--nagar/golden-punjab-hotel"],
    ["another scheme", `ftp://fynix.digital${PAGE_PATH}`],
    ["a broken address", "https://"],
    ["a key over 200 characters", `restaurants/ambarnath/sarvodaya-nagar/${"a".repeat(170)}`],
    ["something huge", `/in/${"a/".repeat(1500)}`],
  ])("refuses %s", (_label, raw) => {
    expect(listingKeyFromPageAddress(raw)).toBeNull();
  });
});

describe("parseVerificationForm", () => {
  const VALID: VerificationValues = {
    listing: `https://fynix.digital${PAGE_PATH}`,
    businessName: "  Golden   Punjab Hotel ",
    phone: "98200 11223",
    phoneCountry: "IN",
    trusted: false,
  };

  it("reads the key, a cleaned name and an E.164 phone", () => {
    expect(parseVerificationForm(VALID)).toEqual({
      success: true,
      data: { listingKey: KEY, businessName: "Golden   Punjab Hotel", phone: "+919820011223", trusted: false },
    });
  });

  it("carries the Trusted choice through", () => {
    expect(parseVerificationForm({ ...VALID, trusted: true })).toMatchObject({ success: true, data: { trusted: true } });
  });

  it("stores no number when the phone is blank, whatever the country", () => {
    expect(parseVerificationForm({ ...VALID, phone: "  ", phoneCountry: "" })).toEqual({
      success: true,
      data: { listingKey: KEY, businessName: "Golden   Punjab Hotel", phone: null, trusted: false },
    });
  });

  it("takes an international number without a country", () => {
    expect(parseVerificationForm({ ...VALID, phone: "+44 20 7946 0958", phoneCountry: "" })).toMatchObject({
      success: true,
      data: { phone: "+442079460958" },
    });
  });

  it.each<[Partial<VerificationValues>, string, string | null]>([
    [{ listing: "" }, "listing", LISTING_MISSING_MESSAGE],
    [{ listing: "https://fynix.digital/in/restaurants/mh/ambarnath" }, "listing", LISTING_INVALID_MESSAGE],
    [{ businessName: " \n " }, "businessName", BUSINESS_NAME_MISSING_MESSAGE],
    [{ businessName: "é".repeat(201) }, "businessName", BUSINESS_NAME_TOO_LONG_MESSAGE],
    [{ phone: "12" }, "phone", null],
    [{ phoneCountry: "" }, "phoneCountry", null],
  ])("points at the field for %j", (overrides, field, message) => {
    const result = parseVerificationForm({ ...VALID, ...overrides });
    expect(result).toMatchObject({ success: false, field });
    if (message !== null) expect(result).toMatchObject({ message });
  });

  it("allows a 200-character name counted in code points", () => {
    expect(parseVerificationForm({ ...VALID, businessName: "é".repeat(200) }).success).toBe(true);
  });

  it("reads posted values as text, blank for anything missing or not text", () => {
    const posted: Record<string, unknown> = { listing: PAGE_PATH, businessName: new Blob(["x"]), phone: "98200 11223" };
    expect(verificationValuesFrom((name) => posted[name])).toEqual({
      listing: PAGE_PATH,
      businessName: "",
      phone: "98200 11223",
      phoneCountry: "",
      trusted: false,
    });
  });

  it("reads the Trusted box as ticked only when the browser posted it as on", () => {
    expect(verificationValuesFrom((name) => (name === "trusted" ? "on" : ""))).toMatchObject({ trusted: true });
    expect(verificationValuesFrom(() => "true")).toMatchObject({ trusted: false });
    expect(verificationValuesFrom(() => null)).toMatchObject({ trusted: false });
  });
});

describe("parseListingKey", () => {
  it("accepts a stored key only", () => {
    expect(parseListingKey(KEY)).toBe(KEY);
    expect(parseListingKey(PAGE_PATH)).toBeNull();
    expect(parseListingKey("restaurants/ambarnath/golden")).toBeNull();
    expect(parseListingKey(null)).toBeNull();
  });
});
