import { describe, expect, it } from "vitest";
import { listingHeadline } from "./headline";

const PLACE = { category: "Dentists", area: "Naupada" } as const;

describe("listingHeadline", () => {
  it("names the category and area once live", () => {
    expect(listingHeadline({ stage: "live", visible: true, ...PLACE })).toBe(
      "People looking for dentists in Naupada find you here.",
    );
  });

  it("says when the listing will go live while the website is being built", () => {
    expect(listingHeadline({ stage: "building", visible: true, ...PLACE })).toBe(
      "Your listing goes live on the local directory the day your website launches.",
    );
  });

  it("says a hidden listing is hidden", () => {
    expect(listingHeadline({ stage: "hidden", visible: false, ...PLACE })).toBe(
      "You're hidden from the local directory. Everything is kept.",
    );
  });

  it("says a paused listing still shows as basic when the client has not hidden it", () => {
    expect(listingHeadline({ stage: "paused", visible: true, ...PLACE })).toBe(
      "You're shown as a basic listing until your payment goes through.",
    );
  });

  it("does not claim a paused listing shows when the client has hidden it", () => {
    expect(listingHeadline({ stage: "paused", visible: false, ...PLACE })).toBe(
      "You're hidden from the local directory. Pay to show your listing again.",
    );
  });
});
