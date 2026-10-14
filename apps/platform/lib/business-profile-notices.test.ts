import { describe, expect, it } from "vitest";
import { profileHref, PROFILE_NOTICES, readProfileNotice } from "./business-profile-notices";

describe("readProfileNotice", () => {
  it("reads a known code back as its fixed message", () => {
    expect(readProfileNotice("published")).toEqual(PROFILE_NOTICES.published);
    expect(readProfileNotice("publish-owner-unconfirmed")).toMatchObject({ ok: false });
  });

  it("says 'Saved to Menu' once the owner has named the tab, and keeps the usual words otherwise", () => {
    expect(readProfileNotice("service-saved", { services: "Menu" })).toEqual({ ok: true, text: "Saved to Menu." });
    expect(readProfileNotice("service-removed", { services: "Menu" })).toEqual({ ok: true, text: "Removed from Menu." });
    expect(readProfileNotice("service-saved-tab", { services: "Menu" })?.text).toBe("Saved to Menu. Your page now has a Menu tab. You can turn it off under Page tabs.");
    expect(readProfileNotice("product-saved", { products: "Medicines" })).toEqual({ ok: true, text: "Saved to Medicines." });
    // A name for one tab never leaks into the other's messages, or into messages about something else.
    expect(readProfileNotice("product-saved", { services: "Menu" })).toEqual(PROFILE_NOTICES["product-saved"]);
    expect(readProfileNotice("service-saved")).toEqual(PROFILE_NOTICES["service-saved"]);
    expect(readProfileNotice("product-photo-removed", { products: "Medicines" })).toEqual(PROFILE_NOTICES["product-photo-removed"]);
    expect(readProfileNotice("published", { services: "Menu" })).toEqual(PROFILE_NOTICES.published);
  });

  it("says when one of the member's short videos was removed, apart from the YouTube video's", () => {
    expect(readProfileNotice("clip-removed")).toEqual({ ok: true, text: "Video removed. It stops showing on your page within a minute." });
    expect(readProfileNotice("video-removed")).toEqual({ ok: true, text: "Video removed." });
  });

  it("says when a video was put at the top of the page or taken off it, and when that could not be done", () => {
    expect(readProfileNotice("clip-featured")).toMatchObject({ ok: true });
    expect(readProfileNotice("clip-unfeatured")).toMatchObject({ ok: true });
    expect(readProfileNotice("clip-feature-failed")).toMatchObject({ ok: false });
  });

  it("shows nothing for an unknown, repeated or missing code", () => {
    expect(readProfileNotice("<script>")).toBeNull();
    expect(readProfileNotice("toString")).toBeNull();
    expect(readProfileNotice(["published", "published"])).toBeNull();
    expect(readProfileNotice(undefined)).toBeNull();
  });
});

describe("profileHref", () => {
  it("links to a tab, with a notice when given", () => {
    expect(profileHref("photos")).toBe("/business?tab=photos");
    expect(profileHref("listing", "listing-added")).toBe("/business?tab=listing&notice=listing-added");
  });
});
