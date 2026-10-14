import type { DirectoryPicture, DirectoryPictureSlot, DirectoryPictureStatus } from "@fynix/db";
import { describe, expect, it } from "vitest";
import { hasAnyPicture, kindStatus, ownPictureHref, readPhotosNotice, shownPicture, slotPictures } from "./photos-view";

let next = 0;

function picture(slot: DirectoryPictureSlot, status: DirectoryPictureStatus): DirectoryPicture {
  next += 1;
  return {
    id: `0192f3c4-0000-7000-8000-${String(next).padStart(12, "0")}`,
    businessId: "0192f3c4-1111-7000-8000-000000000001",
    slot,
    status,
    width: 640,
    height: 640,
    createdAt: new Date("2026-09-30T06:00:00.000Z"),
    decidedAt: status === "pending" ? null : new Date("2026-09-30T07:00:00.000Z"),
  };
}

describe("slotPictures", () => {
  it("sorts each slot's pictures into the live one and the newer one", () => {
    const live = picture("listing", "approved");
    const waiting = picture("listing", "pending");
    const refused = picture("ad_wide", "rejected");
    const slots = slotPictures([live, waiting, refused]);
    expect(slots.listing).toEqual({ live, waiting });
    expect(slots.ad_tall).toEqual({ live: null, waiting: null });
    expect(slots.ad_wide).toEqual({ live: null, waiting: refused });
    expect(shownPicture(slots.listing)).toBe(waiting);
    expect(shownPicture(slots.ad_tall)).toBeNull();
  });
});

describe("kindStatus", () => {
  it("is empty with no picture", () => {
    const slots = slotPictures([]);
    expect(kindStatus(slots, "listing")).toEqual({ state: "empty", hasLive: false });
    expect(kindStatus(slots, "ad")).toEqual({ state: "empty", hasLive: false });
    expect(hasAnyPicture(slots)).toBe(false);
  });

  it("is waiting while any shape waits, and says whether an older picture is still up", () => {
    expect(kindStatus(slotPictures([picture("listing", "pending")]), "listing")).toEqual({ state: "waiting", hasLive: false });
    const replacing = slotPictures([picture("ad_tall", "approved"), picture("ad_wide", "approved"), picture("ad_tall", "pending")]);
    expect(kindStatus(replacing, "ad")).toEqual({ state: "waiting", hasLive: true });
    expect(hasAnyPicture(replacing)).toBe(true);
  });

  it("is refused once staff turn the newest upload down", () => {
    const slots = slotPictures([picture("ad_tall", "approved"), picture("ad_wide", "approved"), picture("ad_wide", "rejected")]);
    expect(kindStatus(slots, "ad")).toEqual({ state: "refused", hasLive: true });
    expect(kindStatus(slots, "listing").state).toBe("empty");
  });

  it("is incomplete for an ad picture with one shape missing, even while the other waits", () => {
    expect(kindStatus(slotPictures([picture("ad_tall", "approved")]), "ad")).toEqual({ state: "incomplete", hasLive: true });
    expect(kindStatus(slotPictures([picture("ad_tall", "pending")]), "ad")).toEqual({ state: "incomplete", hasLive: false });
    expect(kindStatus(slotPictures([picture("ad_wide", "rejected")]), "ad").state).toBe("incomplete");
  });

  it("is showing when every shape is approved", () => {
    expect(kindStatus(slotPictures([picture("listing", "approved")]), "listing")).toEqual({ state: "showing", hasLive: true });
    expect(kindStatus(slotPictures([picture("ad_tall", "approved"), picture("ad_wide", "approved")]), "ad").state).toBe("showing");
  });
});

describe("links and notices", () => {
  it("serves the owner's picture from the app host", () => {
    expect(ownPictureHref("abc")).toBe("/listing-pictures/abc");
  });

  it("reads only the notices it knows", () => {
    expect(readPhotosNotice("removed")).toBe("removed");
    expect(readPhotosNotice(["invalid", "removed"])).toBe("invalid");
    expect(readPhotosNotice("<script>")).toBeNull();
    expect(readPhotosNotice(undefined)).toBeNull();
  });
});
