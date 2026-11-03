import { describe, expect, it } from "vitest";
import { notBoughtView, setupAsks, setupCardTitle, setupPageHref } from "./rules";

const NONE = { social: undefined, search: undefined };

describe("setupAsks", () => {
  it("asks for the accounts and the ad budget for Social & Ads, and the areas for Local SEO + AEO, in the checklist's order", () => {
    expect(setupAsks("social", NONE).map((ask) => ask.key)).toEqual(["accounts", "budget"]);
    expect(setupAsks("search", NONE).map((ask) => ask.key)).toEqual(["areas"]);
  });

  it("no longer asks what to promote: it comes up on the kickoff call", () => {
    expect(setupAsks("social", NONE).map((ask) => ask.key)).not.toContain("offers");
  });

  it("gives each question its label, its hint and the checklist item that takes the answer", () => {
    expect(setupAsks("social", NONE)[0]).toEqual({
      key: "accounts",
      label: "Instagram and Facebook pages",
      hint: "Links to your pages, and whether you added us as an admin",
      href: "/checklist?item=accounts",
    });
  });

  it("leaves out a question that is answered", () => {
    expect(setupAsks("social", { social: { instagramUrl: "https://instagram.com/apex" }, search: undefined }).map((ask) => ask.key)).toEqual(["budget"]);
    expect(setupAsks("social", { social: { instagramUrl: "https://instagram.com/apex", adBudgetRupees: 10000, adArea: "4 km" }, search: undefined })).toEqual([]);
    expect(setupAsks("search", { social: undefined, search: { areas: "Thane West" } })).toEqual([]);
  });

  it("does not count a budget without an area, or a blank link, as answered", () => {
    expect(setupAsks("social", { social: { facebookUrl: "  ", adBudgetRupees: 10000 }, search: undefined }).map((ask) => ask.key)).toEqual(["accounts", "budget"]);
  });

  it("opens the service's own page at its card, and words the card's title", () => {
    expect(setupPageHref("social")).toBe("/social#setup");
    expect(setupPageHref("search")).toBe("/search#setup");
    expect(setupCardTitle(1)).toBe("We need one thing from you");
    expect(setupCardTitle(2)).toBe("We need a few things from you");
  });
});

describe("notBoughtView", () => {
  it("prices a service alone at its list price in rupees, with GST named once", () => {
    const view = notBoughtView({ service: "social", held: [], forfeited: false, currency: "INR" });
    expect(view).toMatchObject({ price: "₹9,999 a month", listPrice: null, offer: null, note: "Prices are in rupees and include GST.", addHref: "/billing?add=social" });
    expect(view.includes).toContain("Your ad spend is paid on top");
  });

  it("takes the package discount the shared rules give once it joins what is held", () => {
    const view = notBoughtView({ service: "search", held: [{ addOn: "managed-website", listCents: 299_900 }], forfeited: false, currency: "INR" });
    expect(view).toMatchObject({ listPrice: "₹24,999 a month", offer: "Package offer, 10% off", addHref: "/billing?add=search" });
    expect(view.price).not.toBe("₹24,999 a month");
  });

  it("gives no discount once the business has given the offer up", () => {
    const view = notBoughtView({ service: "search", held: [{ addOn: "managed-website", listCents: 299_900 }], forfeited: true, currency: "INR" });
    expect(view).toMatchObject({ price: "₹24,999 a month", listPrice: null, offer: null });
  });

  it("never mentions GST beside a dollar price", () => {
    const view = notBoughtView({ service: "social", held: [], forfeited: false, currency: "USD" });
    expect(view.price).toBe("$150 a month");
    expect(view.note).toBe("Prices are in dollars.");
    expect(JSON.stringify(view)).not.toContain("GST");
  });
});
