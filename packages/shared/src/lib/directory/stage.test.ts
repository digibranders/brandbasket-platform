import { describe, expect, it } from "vitest";
import { LISTING_STAGE_LABELS, listingStage } from "./stage";

describe("listingStage", () => {
  it("is building until the website launches, whatever else is true", () => {
    expect(listingStage({ hasLiveProject: false, billingStatus: "paid", visible: true })).toBe("building");
    expect(listingStage({ hasLiveProject: false, billingStatus: "lapsed", visible: false })).toBe("building");
  });

  it("is paused when payment has lapsed, before hidden", () => {
    expect(listingStage({ hasLiveProject: true, billingStatus: "lapsed", visible: false })).toBe("paused");
    expect(listingStage({ hasLiveProject: true, billingStatus: "unpaid", visible: true })).toBe("paused");
  });

  it("is hidden or live for a paid, launched business", () => {
    expect(listingStage({ hasLiveProject: true, billingStatus: "paid", visible: false })).toBe("hidden");
    expect(listingStage({ hasLiveProject: true, billingStatus: "paid", visible: true })).toBe("live");
  });

  it("labels every stage", () => {
    expect(LISTING_STAGE_LABELS).toEqual({
      building: "Goes live with your website",
      live: "Live on the local directory",
      hidden: "Hidden",
      paused: "Paused",
    });
  });
});
