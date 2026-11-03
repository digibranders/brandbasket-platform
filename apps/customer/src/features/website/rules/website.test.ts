import { describe, expect, it } from "vitest";
import { dayLabel, dayStillAhead, stillAhead } from "./dates";
import { holdsWebsite, websiteOffer } from "./not-bought";
import { readWebsiteNotice, websiteNoticeHref } from "./notices";
import { addressPanel, enquiriesSince, pagePath } from "./overview";
import { websiteTabs } from "./paths";

describe("notices", () => {
  it("reads only the three fixed names", () => {
    expect(readWebsiteNotice("approved")).toBe("approved");
    expect(readWebsiteNotice("changes-sent")).toBe("changes-sent");
    expect(readWebsiteNotice("not-ready")).toBe("not-ready");
    expect(readWebsiteNotice("toString")).toBeNull();
    expect(readWebsiteNotice(["approved"])).toBeNull();
    expect(readWebsiteNotice(undefined)).toBeNull();
    expect(websiteNoticeHref("not-ready")).toBe("/website?response=not-ready");
  });
});

describe("websiteTabs", () => {
  it("never shows a Pages tab with no pages", () => {
    expect(websiteTabs(false).map((tab) => tab.label)).toEqual(["Overview", "Blog", "Domain"]);
    expect(websiteTabs(true).map((tab) => tab.label)).toEqual(["Overview", "Pages", "Blog", "Domain"]);
  });
});

describe("dates", () => {
  const now = new Date("2026-11-03T10:00:00+05:30");
  it("keeps a promise only while it is ahead", () => {
    expect(stillAhead(new Date("2026-11-03T11:00:00+05:30"), now)).not.toBeNull();
    expect(stillAhead(new Date("2026-11-03T09:00:00+05:30"), now)).toBeNull();
    expect(dayStillAhead("2026-11-03", now)).toBe("2026-11-03");
    expect(dayStillAhead("2026-11-02", now)).toBeNull();
  });

  it("writes a day without its year", () => {
    expect(dayLabel("2027-01-05")).toBe("Tue 5 Jan");
  });
});

describe("addressPanel", () => {
  it("promises to connect their own domain until the preview is approved", () => {
    expect(addressPanel({ hostname: "apex.in", status: "pending", isFreeAddress: false }, "preview")).toEqual({ hostname: "apex.in", line: "We connect it when you approve." });
    expect(addressPanel({ hostname: "apex.in", status: "awaiting_dns", isFreeAddress: false }, "approved")).toEqual({ hostname: "apex.in", line: null });
  });

  it("names the free address as it is, and nothing without an address", () => {
    expect(addressPanel({ hostname: "apex.sites.test", status: "active", isFreeAddress: true }, "building")).toEqual({ hostname: "apex.sites.test", line: null });
    expect(addressPanel(null, "building")).toBeNull();
  });
});

describe("enquiriesSince", () => {
  it("counts the last 30 days only", () => {
    const now = new Date("2026-11-30T12:00:00Z");
    const rows = [new Date("2026-11-29T00:00:00Z"), new Date("2026-10-31T12:00:00Z"), new Date("2026-10-31T11:59:59Z")].map((receivedAt) => ({ receivedAt }));
    expect(enquiriesSince(rows, now)).toBe(2);
  });
});

describe("pagePath", () => {
  it("shows the path of a page, or the stored text when it is not a URL", () => {
    expect(pagePath("https://apex.in/")).toBe("/");
    expect(pagePath("https://apex.in/tests?x=1")).toBe("/tests?x=1");
    expect(pagePath("not a url")).toBe("not a url");
  });
});

describe("websiteOffer", () => {
  it("is the list price alone, with no package", () => {
    expect(websiteOffer([], false, "INR")).toMatchObject({ title: "Managed Website", netCents: 299_900, offerCents: 0, unit: "a month" });
    expect(websiteOffer([], false, "USD")).toMatchObject({ netCents: 6_500, offerCents: 0 });
  });

  it("takes the package discount the shared rule gives with the services held", () => {
    // All three: 20% off the website's ₹2,999.
    expect(websiteOffer(["social", "search"], false, "INR")).toMatchObject({ netCents: 239_920, offerCents: 59_980 });
    expect(websiteOffer(["social"], false, "INR").offerCents).toBeGreaterThan(0);
  });

  it("gives no discount once the business has given the offer up", () => {
    expect(websiteOffer(["social", "search"], true, "INR")).toMatchObject({ netCents: 299_900, offerCents: 0 });
  });
});

describe("holdsWebsite", () => {
  const facts = (status: "paid" | "lapsed" | "unpaid", hasWebsite: boolean, services: readonly ("website" | "social" | "search")[]) =>
    ({ billing: { status, hasWebsite }, services }) as unknown as Parameters<typeof holdsWebsite>[0];

  it("follows billing for a paying business, so a dropped website runs to the end of its month", () => {
    expect(holdsWebsite(facts("paid", true, []))).toBe(true);
    expect(holdsWebsite(facts("paid", false, ["website"]))).toBe(false);
  });

  it("follows the plan for a lapsed business, which keeps reading its website", () => {
    expect(holdsWebsite(facts("lapsed", false, ["website"]))).toBe(true);
    expect(holdsWebsite(facts("lapsed", false, ["social"]))).toBe(false);
  });
});
