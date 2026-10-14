import { describe, expect, it } from "vitest";
import { clientListingSections, opensClaimPages } from "./listing-sections";

describe("opensClaimPages", () => {
  it("opens the listing pages to every free listing account, with a business or not yet", () => {
    expect(opensClaimPages("listing", false)).toBe(true);
    expect(opensClaimPages("listing", true)).toBe(true);
  });

  it("opens them to a Premium member, who keeps the business it claimed while it was free", () => {
    expect(opensClaimPages("website", true)).toBe(true);
  });

  it("keeps them from a website client that never had a free listing", () => {
    expect(opensClaimPages("website", false)).toBe(false);
  });
});

describe("clientListingSections", () => {
  it("has none for a website client with no listing", () => {
    expect(clientListingSections({ ownListing: false, claim: false })).toEqual([]);
  });

  it("gives a client with a listing staff placed its Listing tab and its leads", () => {
    expect(clientListingSections({ ownListing: true, claim: false })).toEqual(["listing", "leads", "reviews"]);
  });

  it("keeps every free listing section for a member: its Business profile (photos inside), leads and ads", () => {
    expect(clientListingSections({ ownListing: false, claim: true })).toEqual(["claim-listing", "leads", "reviews", "deals", "advertise"]);
  });

  it("shows the placed listing's tab, and not a second Listing, for a member staff also placed", () => {
    expect(clientListingSections({ ownListing: true, claim: true })).toEqual(["listing", "leads", "reviews", "photos", "deals", "advertise"]);
  });
});
