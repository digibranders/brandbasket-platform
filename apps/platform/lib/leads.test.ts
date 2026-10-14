import { describe, expect, it } from "vitest";
import { businessRef, leadSerialNumber, leadWhatsAppUrl, leadsPaging, leadsLede, leadsSource, leadsWindowStart, placementListingKey, requestedLeadsPage, requestedLeadsTab, leadsTabHref } from "./leads";

const KEY = "dentists/thane/naupada/smile-dental";
const STAFF_KEY = "dentists/thane/naupada/smile-dental-clinic";

const PLACED = { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada", slug: "smile-dental-clinic", placeId: null };

describe("leadsSource", () => {
  it("opens a confirmed claim's leads for a free listing, by its permanent id where it has one", () => {
    expect(leadsSource({ kind: "listing", ownListing: null, claim: { status: "approved", listingKey: KEY, placeId: "k7m2q9a" } })).toEqual({
      state: "open",
      business: { placeId: "k7m2q9a", listingKey: KEY },
    });
    expect(leadsSource({ kind: "listing", ownListing: null, claim: { status: "approved", listingKey: KEY, placeId: null } })).toEqual({
      state: "open",
      business: { placeId: null, listingKey: KEY },
    });
  });

  it("asks a free account with no business yet to add one", () => {
    expect(leadsSource({ kind: "listing", ownListing: null, claim: null })).toEqual({ state: "no-business" });
  });

  it("waits for a business that isn't live yet", () => {
    expect(leadsSource({ kind: "listing", ownListing: null, claim: { status: "pending", listingKey: KEY, placeId: null } })).toEqual({ state: "pending" });
  });

  it("says so when the claim was turned down", () => {
    expect(leadsSource({ kind: "listing", ownListing: null, claim: { status: "rejected", listingKey: KEY, placeId: null } })).toEqual({ state: "rejected" });
  });

  it("opens a website client's own listing, ahead of any claim it made before", () => {
    expect(
      leadsSource({ kind: "website", ownListing: { ...PLACED, placeId: "a2345bc" }, claim: { status: "approved", listingKey: KEY, placeId: null } }),
    ).toEqual({ state: "open", business: { placeId: "a2345bc", listingKey: STAFF_KEY } });
  });

  it("opens the claim a member brought with it from its free listing", () => {
    expect(leadsSource({ kind: "website", ownListing: null, claim: { status: "approved", listingKey: KEY, placeId: null } })).toEqual({
      state: "open",
      business: { placeId: null, listingKey: KEY },
    });
  });

  it("has nothing for a website client with no listing at all", () => {
    expect(leadsSource({ kind: "website", ownListing: null, claim: null })).toEqual({ state: "none" });
    expect(leadsSource({ kind: "website", ownListing: null, claim: { status: "pending", listingKey: KEY, placeId: null } })).toEqual({ state: "none" });
  });
});

describe("businessRef", () => {
  it("names a business by its place id where it has one, keeping its key", () => {
    expect(businessRef("k7m2q9a", KEY)).toEqual({ placeId: "k7m2q9a", listingKey: KEY });
    expect(businessRef(null, KEY)).toEqual({ placeId: null, listingKey: KEY });
  });
});

describe("requestedLeadsPage", () => {
  it("is the first page when none is asked for", () => {
    expect(requestedLeadsPage(undefined)).toBe(1);
  });

  it("reads a whole page number", () => {
    expect(requestedLeadsPage("3")).toBe(3);
  });

  it("falls back to the first page for anything that is not a whole number above zero", () => {
    for (const raw of ["0", "-2", "1.5", "two", "", " 2", "2abc", "1e3"]) {
      expect(requestedLeadsPage(raw)).toBe(1);
    }
  });

  it("takes the first of a repeated parameter", () => {
    expect(requestedLeadsPage(["4", "9"])).toBe(4);
  });

  it("refuses a number too big to be a page", () => {
    expect(requestedLeadsPage("99999999999999999999")).toBe(1);
  });
});

describe("leadsPaging", () => {
  it("has one page, and nothing either side, when there are no leads", () => {
    expect(leadsPaging(0, 1, 25)).toEqual({ page: 1, pageCount: 1, offset: 0, newerPage: null, olderPage: null });
  });

  it("offers older leads from the first of several pages", () => {
    expect(leadsPaging(60, 1, 25)).toEqual({ page: 1, pageCount: 3, offset: 0, newerPage: null, olderPage: 2 });
  });

  it("offers both ways from a middle page", () => {
    expect(leadsPaging(60, 2, 25)).toEqual({ page: 2, pageCount: 3, offset: 25, newerPage: 1, olderPage: 3 });
  });

  it("offers only newer leads from the last page", () => {
    expect(leadsPaging(60, 3, 25)).toEqual({ page: 3, pageCount: 3, offset: 50, newerPage: 2, olderPage: null });
  });

  it("shows the last page for a page past the end", () => {
    expect(leadsPaging(30, 7, 25)).toEqual({ page: 2, pageCount: 2, offset: 25, newerPage: 1, olderPage: null });
  });

  it("numbers each page's first lead on from the pages before it", () => {
    expect(leadSerialNumber(0, 0)).toBe(1);
    expect(leadSerialNumber(25, 0)).toBe(26);
    expect(leadSerialNumber(25, 5)).toBe(31);
  });

  it("fills a page exactly without inventing another", () => {
    expect(leadsPaging(50, 2, 25).pageCount).toBe(2);
  });
});

describe("leadWhatsAppUrl", () => {
  it("opens a chat with the visitor's full number", () => {
    expect(leadWhatsAppUrl("+919082205341")).toBe("https://wa.me/919082205341");
  });

  it("is null for a number too short to be one", () => {
    expect(leadWhatsAppUrl("+1234")).toBeNull();
  });
});

describe("leadsWindowStart", () => {
  it("is thirty days before now: the window the Leads page counts enquiries in", () => {
    expect(leadsWindowStart(new Date("2026-10-31T10:00:00.000Z")).toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });
});

describe("requestedLeadsTab", () => {
  it("reads the tab named in the address", () => {
    expect(requestedLeadsTab("new")).toBe("new");
    expect(requestedLeadsTab("replied")).toBe("replied");
    expect(requestedLeadsTab("all")).toBe("all");
  });

  it("shows every enquiry for anything else", () => {
    expect(requestedLeadsTab(undefined)).toBe("all");
    expect(requestedLeadsTab("Replied")).toBe("all");
    expect(requestedLeadsTab(["new", "replied"])).toBe("new");
    expect(requestedLeadsTab("<script>")).toBe("all");
  });
});

describe("leadsTabHref", () => {
  it("links to a tab, leaving off what is the default", () => {
    expect(leadsTabHref("all", null)).toBe("/leads");
    expect(leadsTabHref("new", null)).toBe("/leads?tab=new");
    expect(leadsTabHref("replied", "Dentists")).toBe("/leads?category=Dentists&tab=replied");
  });
});

describe("leadsLede", () => {
  it("says how many are new and how many came in the window", () => {
    expect(leadsLede({ newCount: 4, windowCount: 8 })).toBe("4 new · 8 enquiries in the last 30 days");
  });

  it("says one enquiry in the singular", () => {
    expect(leadsLede({ newCount: 1, windowCount: 1 })).toBe("1 new · 1 enquiry in the last 30 days");
  });

  it("says plainly when there is nothing new", () => {
    expect(leadsLede({ newCount: 0, windowCount: 5 })).toBe("Nothing new · 5 enquiries in the last 30 days");
  });

  it("says plainly when there is nothing at all", () => {
    expect(leadsLede({ newCount: 0, windowCount: 0 })).toBe("No enquiries in the last 30 days");
  });
});

describe("placementListingKey", () => {
  it("joins a listing's place in the directory into the key its enquiries carry", () => {
    expect(placementListingKey({ categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada", slug: "smile-dental", placeId: null })).toBe(KEY);
  });
});
