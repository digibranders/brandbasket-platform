import { describe, expect, it } from "vitest";
import {
  canPublish,
  displayBusinessId,
  isPublished,
  missingForPublish,
  nextTab,
  openingTab,
  profileTabs,
  type ProfileState,
} from "./business-profile";

const FRESH: ProfileState = {
  hasDetails: false,
  hasPhoto: false,
  hasVideo: false,
  serviceCount: 0,
  productCount: 0,
  faqCount: 0,
  hasTrust: false,
  pageTabLabels: {},
  listing: "none",
  status: null,
};
const READY: ProfileState = { ...FRESH, hasDetails: true, hasPhoto: true, listing: "added", status: "pending" };
const LIVE: ProfileState = { ...READY, status: "approved" };
const CLAIMED: ProfileState = { ...FRESH, listing: "claimed", status: "pending" };

describe("profileTabs", () => {
  it("shows the tabs in the sheet's order with Listing after Identity, ticking what is saved", () => {
    expect(profileTabs(FRESH).map((tab) => [tab.id, tab.done])).toEqual([
      ["details", false],
      ["listing", false],
      ["services", false],
      ["products", false],
      ["faq", false],
      ["photos", false],
      ["contact", false],
      ["reviews", false],
      ["promotions", false],
      ["trust", false],
      ["page-tabs", false],
      ["review", false],
    ]);
    const filled = profileTabs({ ...FRESH, hasDetails: true, hasPhoto: true, serviceCount: 2, productCount: 1, faqCount: 3, hasTrust: true });
    expect(filled.filter((tab) => tab.done).map((tab) => tab.id)).toEqual(["details", "services", "products", "faq", "photos", "contact", "trust"]);
  });

  it("calls the last tab Live page once published, and leaves it out for a claimed listing", () => {
    expect(profileTabs(LIVE).at(-1)).toEqual({ id: "review", label: "Live page", done: true });
    expect(profileTabs(CLAIMED).map((tab) => tab.id)).not.toContain("review");
  });
});

describe("publishing", () => {
  it("needs Identity, Listing and a feature photo", () => {
    expect(missingForPublish(FRESH)).toEqual(["details", "listing", "photos"]);
    expect(canPublish(FRESH)).toBe(false);
    expect(canPublish({ ...READY, hasPhoto: false })).toBe(false);
  });

  it("is closed once live, after a take-down, and for a claimed listing", () => {
    expect(isPublished(LIVE)).toBe(true);
    expect(canPublish(LIVE)).toBe(false);
    expect(canPublish({ ...READY, status: "rejected" })).toBe(false);
    expect(canPublish({ ...CLAIMED, hasDetails: true, hasPhoto: true })).toBe(false);
  });
});

describe("openingTab", () => {
  it("opens on the next required thing while setting up", () => {
    expect(openingTab(FRESH, undefined)).toBe("details");
    expect(openingTab({ ...FRESH, hasDetails: true }, undefined)).toBe("listing");
    expect(openingTab({ ...FRESH, hasDetails: true, listing: "added", status: "pending" }, undefined)).toBe("photos");
    expect(openingTab(READY, undefined)).toBe("review");
  });

  it("opens on Identity once live or claimed", () => {
    expect(openingTab(LIVE, undefined)).toBe("details");
    expect(openingTab({ ...CLAIMED, hasDetails: true }, undefined)).toBe("details");
  });

  it("opens on the tab asked for when the business has it", () => {
    expect(openingTab(FRESH, "listing")).toBe("listing");
    expect(openingTab(FRESH, "trust")).toBe("trust");
    expect(openingTab(CLAIMED, "review")).toBe("details");
    expect(openingTab(FRESH, "nonsense")).toBe("details");
  });
});

describe("nextTab", () => {
  it("steps through the tabs the business has", () => {
    expect(nextTab(FRESH, "details")).toBe("listing");
    expect(nextTab(FRESH, "listing")).toBe("services");
    expect(nextTab(FRESH, "trust")).toBe("page-tabs");
    expect(nextTab(FRESH, "page-tabs")).toBe("review");
    expect(nextTab(FRESH, "review")).toBeNull();
    expect(nextTab(CLAIMED, "trust")).toBe("page-tabs");
    expect(nextTab(CLAIMED, "page-tabs")).toBeNull();
  });
});

describe("displayBusinessId", () => {
  it("shows the id in capitals", () => {
    expect(displayBusinessId("7k2m9qa")).toBe("7K2M9QA");
  });
});
