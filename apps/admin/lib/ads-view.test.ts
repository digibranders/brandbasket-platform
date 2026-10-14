import { describe, expect, it } from "vitest";
import { adsHref, parseAdsNotice, parseAdsView } from "./ads-view";

function view(params: Record<string, string>) {
  return parseAdsView((name) => params[name]);
}

describe("parseAdsView", () => {
  it("opens on the pending claims", () => {
    expect(view({})).toEqual({ section: "claims", status: "pending", page: 1 });
  });

  it("reads a claims filter and page, ignoring anything unknown", () => {
    expect(view({ status: "tagline", page: "3" })).toEqual({ section: "claims", status: "tagline", page: 3 });
    expect(view({ status: "everything", page: "-2" })).toEqual({ section: "claims", status: "pending", page: 1 });
  });

  it("reads the pictures section with its own filter and page", () => {
    expect(view({ show: "pictures" })).toEqual({ section: "pictures", status: "pending", page: 1 });
    expect(view({ show: "pictures", status: "rejected", page: "2" })).toEqual({ section: "pictures", status: "rejected", page: 2 });
    // "tagline" is a claims filter, not a pictures one.
    expect(view({ show: "pictures", status: "tagline" })).toEqual({ section: "pictures", status: "pending", page: 1 });
  });

  it("reads the videos section as one list of live videos, by page", () => {
    expect(view({ show: "videos" })).toEqual({ section: "videos", page: 1 });
    expect(view({ show: "videos", page: "2" })).toEqual({ section: "videos", page: 2 });
    // Videos need no check, so there are no status filters to ask for.
    expect(view({ show: "videos", status: "rejected", page: "3" })).toEqual({ section: "videos", page: 3 });
  });

  it("reads the other sections", () => {
    expect(view({ show: "auctions" })).toEqual({ section: "auctions" });
    expect(view({ show: "placed" })).toEqual({ section: "placed" });
    expect(view({ show: "prices", status: "approved" })).toEqual({ section: "prices" });
  });

  it("reads which booking is being edited, and ignores anything that is not an id", () => {
    const id = "01a13467-d244-7640-a403-15cbf64d9369";
    expect(view({ show: "placed", edit: id })).toEqual({ section: "placed", edit: id });
    expect(view({ show: "placed", edit: "1; drop table" })).toEqual({ section: "placed" });
    expect(view({ show: "claims", edit: id })).toEqual({ section: "claims", status: "pending", page: 1 });
    expect(adsHref({ section: "placed", edit: id })).toBe(`/ads?show=placed&edit=${id}`);
    expect(view({ show: "placed", edit: id, done: "ad_edited" })).toEqual({ section: "placed", edit: id });
    expect(parseAdsNotice("ad_edited")).toBe("ad_edited");
  });
});

describe("adsHref", () => {
  it("leaves the defaults out and round-trips", () => {
    expect(adsHref({ section: "claims", status: "pending", page: 1 })).toBe("/ads");
    const href = adsHref({ section: "claims", status: "approved", page: 2 }, "approved");
    expect(href).toBe("/ads?status=approved&page=2&done=approved");
    const params = new URL(href, "http://admin.localhost").searchParams;
    expect(view(Object.fromEntries(params))).toEqual({ section: "claims", status: "approved", page: 2 });
    expect(adsHref({ section: "prices" }, "price_saved")).toBe("/ads?show=prices&done=price_saved");
    expect(adsHref({ section: "pictures", status: "pending", page: 1 })).toBe("/ads?show=pictures");
    expect(adsHref({ section: "pictures", status: "approved", page: 3 }, "picture_approved")).toBe(
      "/ads?show=pictures&status=approved&page=3&done=picture_approved",
    );
    expect(adsHref({ section: "videos", page: 1 })).toBe("/ads?show=videos");
    expect(adsHref({ section: "videos", page: 2 }, "video_removed")).toBe("/ads?show=videos&page=2&done=video_removed");
  });
});

describe("parseAdsNotice", () => {
  it("accepts only known notices", () => {
    expect(parseAdsNotice("price_saved")).toBe("price_saved");
    expect(parseAdsNotice("spot_price_saved")).toBe("spot_price_saved");
    expect(parseAdsNotice("video_removed")).toBe("video_removed");
    // Videos are not approved by staff, so there is no such notice.
    expect(parseAdsNotice("video_approved")).toBeNull();
    expect(parseAdsNotice("video_rejected")).toBeNull();
    expect(parseAdsNotice("<script>")).toBeNull();
  });
});
