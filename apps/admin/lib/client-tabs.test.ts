import { describe, expect, it } from "vitest";
import { clientTabHref, forwardedNoticeHref, tabsFor } from "./client-tabs";

const ID = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

describe("tabsFor", () => {
  it("hides Billing from support staff", () => {
    expect(tabsFor("support").map((tab) => tab.label)).toEqual(["Overview", "Project", "Services", "Website", "Requests", "People", "Activity"]);
  });

  it("shows Billing to finance and admin", () => {
    for (const role of ["finance", "admin"] as const) {
      expect(tabsFor(role).map((tab) => tab.label)).toEqual(["Overview", "Project", "Billing", "Services", "Website", "Requests", "People", "Activity"]);
    }
  });
});

describe("clientTabHref", () => {
  it("opens the Overview on the client's own address and the others under it", () => {
    expect(clientTabHref(ID, "")).toBe(`/clients/${ID}`);
    expect(clientTabHref(ID, "project")).toBe(`/clients/${ID}/project`);
  });
});

describe("forwardedNoticeHref", () => {
  it("sends billing notices to Billing with their query", () => {
    expect(forwardedNoticeHref(ID, { payment: "recorded" })).toBe(`/clients/${ID}/billing?payment=recorded`);
    expect(forwardedNoticeHref(ID, { charges: "added" })).toBe(`/clients/${ID}/billing?charges=added`);
    expect(forwardedNoticeHref(ID, { invoice: "issued" })).toBe(`/clients/${ID}/billing?invoice=issued`);
  });

  it("sends preview, launch and domain notices to Project", () => {
    expect(forwardedNoticeHref(ID, { preview: "sent" })).toBe(`/clients/${ID}/project?preview=sent`);
    expect(forwardedNoticeHref(ID, { launch: "launched" })).toBe(`/clients/${ID}/project?launch=launched`);
    expect(forwardedNoticeHref(ID, { dns: "ready" })).toBe(`/clients/${ID}/project?dns=ready`);
  });

  it("sends add-on and chatbot notices to Services, and website notices to Website, keeping every part of the query", () => {
    expect(forwardedNoticeHref(ID, { addOns: "contacted" })).toBe(`/clients/${ID}/services?addOns=contacted`);
    expect(forwardedNoticeHref(ID, { chatbots: "removed" })).toBe(`/clients/${ID}/services?chatbots=removed`);
    expect(forwardedNoticeHref(ID, { listing: "invalid", listingField: "citySlug" })).toBe(`/clients/${ID}/website?listing=invalid&listingField=citySlug`);
    expect(forwardedNoticeHref(ID, { features: "zone-saved" })).toBe(`/clients/${ID}/website?features=zone-saved`);
  });

  it("is null when the query names no notice", () => {
    expect(forwardedNoticeHref(ID, {})).toBeNull();
    expect(forwardedNoticeHref(ID, { q: "bakery" })).toBeNull();
  });
});
