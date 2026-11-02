import { describe, expect, it } from "vitest";
import { clientTabHref, clientTabHrefWithQuery, CLIENT_TABS, forwardedNoticeHref, tabsFor } from "./client-tabs";

const ROLES = ["support", "finance", "admin"] as const;
const ID = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

describe("tabsFor", () => {
  it("gives every role the same five tabs, in order, with these labels", () => {
    for (const role of ROLES) {
      expect(tabsFor(role).map((tab) => tab.label), role).toEqual(["Overview", "Website", "Plan and billing", "Messages", "People"]);
      expect(tabsFor(role).map((tab) => tab.slug), role).toEqual(["", "website", "billing", "requests", "people"]);
    }
  });

  it("keeps no tab behind a capability, because the money half of Plan and billing guards itself", () => {
    expect(CLIENT_TABS.some((tab) => "needs" in tab)).toBe(false);
  });
});

describe("clientTabHref", () => {
  it("opens the Overview on the client's own address and the others under it", () => {
    expect(clientTabHref(ID, "")).toBe(`/clients/${ID}`);
    expect(clientTabHref(ID, "website")).toBe(`/clients/${ID}/website`);
  });
});

describe("clientTabHrefWithQuery", () => {
  it("keeps every part of the query, repeated keys included, and drops undefined ones", () => {
    expect(clientTabHrefWithQuery(ID, "website", { move: "cancelled", build: undefined, tag: ["a", "b"] })).toBe(`/clients/${ID}/website?move=cancelled&tag=a&tag=b`);
  });

  it("is the bare address when there is no query", () => {
    expect(clientTabHrefWithQuery(ID, "billing", {})).toBe(`/clients/${ID}/billing`);
  });
});

describe("forwardedNoticeHref", () => {
  it("sends payment, charge, invoice and refund notices to Plan and billing with their query", () => {
    expect(forwardedNoticeHref(ID, { payment: "recorded" })).toBe(`/clients/${ID}/billing?payment=recorded`);
    expect(forwardedNoticeHref(ID, { charges: "added" })).toBe(`/clients/${ID}/billing?charges=added`);
    expect(forwardedNoticeHref(ID, { invoice: "issued" })).toBe(`/clients/${ID}/billing?invoice=issued`);
    expect(forwardedNoticeHref(ID, { refund: "marked" })).toBe(`/clients/${ID}/billing?refund=marked`);
  });

  it("sends add-on, work, numbers, updates and chatbot notices to Plan and billing", () => {
    expect(forwardedNoticeHref(ID, { addOns: "contacted" })).toBe(`/clients/${ID}/billing?addOns=contacted`);
    expect(forwardedNoticeHref(ID, { work: "saved" })).toBe(`/clients/${ID}/billing?work=saved`);
    expect(forwardedNoticeHref(ID, { numbers: "saved" })).toBe(`/clients/${ID}/billing?numbers=saved`);
    expect(forwardedNoticeHref(ID, { updates: "added" })).toBe(`/clients/${ID}/billing?updates=added`);
    expect(forwardedNoticeHref(ID, { chatbots: "removed" })).toBe(`/clients/${ID}/billing?chatbots=removed`);
  });

  it("sends preview, launch, domain, build and site-data notices to Website, keeping every part of the query", () => {
    expect(forwardedNoticeHref(ID, { preview: "sent" })).toBe(`/clients/${ID}/website?preview=sent`);
    expect(forwardedNoticeHref(ID, { launch: "launched" })).toBe(`/clients/${ID}/website?launch=launched`);
    expect(forwardedNoticeHref(ID, { dns: "ready" })).toBe(`/clients/${ID}/website?dns=ready`);
    expect(forwardedNoticeHref(ID, { build: "paused" })).toBe(`/clients/${ID}/website?build=paused`);
    expect(forwardedNoticeHref(ID, { move: "round-added" })).toBe(`/clients/${ID}/website?move=round-added`);
    expect(forwardedNoticeHref(ID, { listing: "invalid", listingField: "citySlug" })).toBe(`/clients/${ID}/website?listing=invalid&listingField=citySlug`);
    expect(forwardedNoticeHref(ID, { features: "zone-saved" })).toBe(`/clients/${ID}/website?features=zone-saved`);
    expect(forwardedNoticeHref(ID, { hosting: "saved" })).toBe(`/clients/${ID}/website?hosting=saved`);
  });

  it("sends call and request notices to Messages", () => {
    expect(forwardedNoticeHref(ID, { calls: "held" })).toBe(`/clients/${ID}/requests?calls=held`);
    expect(forwardedNoticeHref(ID, { requests: "sent", mail: "failed" })).toBe(`/clients/${ID}/requests?requests=sent&mail=failed`);
  });

  it("is null when the query names no notice", () => {
    expect(forwardedNoticeHref(ID, {})).toBeNull();
    expect(forwardedNoticeHref(ID, { q: "bakery" })).toBeNull();
  });
});
