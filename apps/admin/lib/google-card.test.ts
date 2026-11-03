import type { ReportSourceRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import {
  analyticsFacts,
  analyticsLink,
  analyticsPill,
  analyticsTagFact,
  canManageGoogle,
  GOOGLE_STUCK_DAYS,
  googleButtons,
  googleCallout,
  googleCardState,
  hostOfSite,
  isGoogleStuck,
  searchConsoleFacts,
  searchConsoleLink,
  searchConsolePill,
  wholeDaysBetween,
} from "./google-card";

const NOW = new Date("2026-11-03T04:00:00.000Z");
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 86_400_000);
const SITE = "https://omsweets.in/";

const row = (over: Partial<ReportSourceRow> = {}): ReportSourceRow => ({
  id: "r1",
  businessId: "b1",
  source: "gsc",
  externalId: SITE,
  status: "awaiting_setup",
  lastOkAt: null,
  lastError: null,
  googleSlot: 1,
  measurementId: null,
  verifiedAt: null,
  provisionedAt: null,
  secondOwnerOk: false,
  detail: null,
  createdAt: daysAgo(1),
  updatedAt: daysAgo(0),
  ...over,
});
const CONNECTED_GSC = row({ status: "connected", verifiedAt: daysAgo(20), secondOwnerOk: true });
const CONNECTED_GA4 = row({ source: "ga4", externalId: "412345678", status: "connected", measurementId: "G-AB12CD34EF" });

describe("isGoogleStuck", () => {
  it("is true only for an unverified site made more than three days ago", () => {
    expect(GOOGLE_STUCK_DAYS).toBe(3);
    expect(isGoogleStuck(row({ createdAt: daysAgo(3) }), NOW)).toBe(false);
    expect(isGoogleStuck(row({ createdAt: new Date(daysAgo(3).getTime() - 1) }), NOW)).toBe(true);
    expect(isGoogleStuck(row({ createdAt: daysAgo(9), verifiedAt: daysAgo(1) }), NOW)).toBe(false);
    expect(isGoogleStuck(row({ createdAt: daysAgo(9), status: "removed" }), NOW)).toBe(false);
    expect(isGoogleStuck(row({ createdAt: daysAgo(9), status: "access_lost" }), NOW)).toBe(false);
    expect(isGoogleStuck(null, NOW)).toBe(false);
  });

  it("does not read the clocks the go live job keeps moving", () => {
    expect(isGoogleStuck(row({ createdAt: daysAgo(1), provisionedAt: daysAgo(30), updatedAt: daysAgo(30) }), NOW)).toBe(false);
    expect(isGoogleStuck(row({ createdAt: daysAgo(5), provisionedAt: new Date(NOW.getTime() - 60_000), updatedAt: NOW }), NOW)).toBe(true);
  });
});

describe("wholeDaysBetween", () => {
  it("counts whole days and never goes below zero", () => {
    expect(wholeDaysBetween(daysAgo(4), NOW)).toBe(4);
    expect(wholeDaysBetween(new Date(daysAgo(4).getTime() + 1), NOW)).toBe(3);
    expect(wholeDaysBetween(daysAgo(-2), NOW)).toBe(0);
  });
});

describe("googleCardState", () => {
  const state = (gsc: ReportSourceRow | null, ga4: ReportSourceRow | null, freeAddress = false) => googleCardState({ gsc, ga4, freeAddress, now: NOW });
  it("is connected only when both halves are", () => {
    expect(state(CONNECTED_GSC, CONNECTED_GA4)).toBe("connected");
    expect(state(CONNECTED_GSC, row({ source: "ga4", status: "awaiting_setup" }))).toBe("setting-up");
    expect(state(CONNECTED_GSC, null)).toBe("setting-up");
  });
  it("is setting up while an unverified site is under three days old", () => {
    expect(state(row(), row({ source: "ga4", status: "awaiting_setup" }))).toBe("setting-up");
  });
  it("needs a look when Search Console is stuck or a half lost its access", () => {
    expect(state(row({ createdAt: daysAgo(4) }), row({ source: "ga4", status: "awaiting_setup" }))).toBe("needs-look");
    expect(state(CONNECTED_GSC, row({ source: "ga4", status: "access_lost" }))).toBe("needs-look");
    expect(state(row({ status: "access_lost" }), null)).toBe("needs-look");
  });
  it("is a free address or not added when there are no rows, and detached when a row was removed", () => {
    expect(state(null, null, true)).toBe("free-address");
    expect(state(null, null, false)).toBe("not-added");
    expect(state(row({ status: "removed" }), row({ source: "ga4", status: "removed" }))).toBe("detached");
    expect(state(CONNECTED_GSC, row({ source: "ga4", status: "removed" }))).toBe("detached");
  });
  it("goes by the rows when a free address still has some", () => {
    expect(state(CONNECTED_GSC, CONNECTED_GA4, true)).toBe("connected");
  });
});

describe("the two halves", () => {
  it("names each state in words", () => {
    expect(searchConsolePill(CONNECTED_GSC, NOW)).toEqual({ tone: "done", label: "Connected" });
    expect(searchConsolePill(row(), NOW)).toEqual({ tone: "wait", label: "Waiting for the tag" });
    expect(searchConsolePill(row({ createdAt: daysAgo(4) }), NOW)).toEqual({ tone: "problem", label: "Not verified" });
    expect(searchConsolePill(row({ status: "access_lost" }), NOW)).toEqual({ tone: "problem", label: "Access lost" });
    expect(searchConsolePill(row({ status: "pending", verifiedAt: NOW }), NOW)).toEqual({ tone: "wait", label: "Waiting for first data" });
    expect(searchConsolePill(row({ status: "removed" }), NOW)).toEqual({ tone: "todo", label: "Detached" });
    expect(searchConsolePill(null, NOW)).toEqual({ tone: "todo", label: "Not added" });
    expect(analyticsPill(CONNECTED_GA4)).toEqual({ tone: "done", label: "Connected" });
    expect(analyticsPill(row({ source: "ga4", status: "awaiting_setup" }))).toEqual({ tone: "wait", label: "Waiting for the tag" });
    expect(analyticsPill(row({ source: "ga4", status: "access_lost" }))).toEqual({ tone: "problem", label: "Access lost" });
    expect(analyticsPill(null)).toEqual({ tone: "todo", label: "Not added" });
  });

  it("shows Search Console as the rows say it", () => {
    expect(searchConsoleFacts(CONNECTED_GSC, "2026-10-30", NOW)).toEqual([
      { label: "Site", value: SITE, figure: true },
      { label: "Verified", value: "Yes", note: "Meta tag", at: CONNECTED_GSC.verifiedAt },
      { label: "Second owner", value: "Added", note: "Google lists both owners" },
      { label: "Last data day", value: "2026-10-30", note: "Search Console runs about 3 days behind" },
    ]);
    const waiting = searchConsoleFacts(row({ detail: "Waiting for the site to show the verification tag" }), null, NOW);
    expect(waiting.map((fact) => [fact.label, fact.value])).toEqual([["Site", SITE], ["Verified", "Not yet"], ["Second owner", "After verifying"], ["Last data day", "None yet"]]);
    expect(waiting[1]?.note).toBe("Waiting for the site to show the verification tag");
    expect(searchConsoleFacts(row({ createdAt: daysAgo(5) }), null, NOW)[1]?.value).toBe("No");
    const owner = searchConsoleFacts(row({ status: "pending", verifiedAt: NOW, detail: "No second owner is set" }), null, NOW)[2];
    expect([owner?.value, owner?.note]).toEqual(["Not added yet", "No second owner is set"]);
    expect(searchConsoleFacts(null, null, NOW)).toEqual([{ label: "Site", value: "Not added yet" }]);
  });

  it("never says the tag was seen: the Analytics line is Switched off or On, with no check claimed", () => {
    expect(analyticsTagFact(false)).toMatchObject({ value: "Switched off" });
    expect(analyticsTagFact(true)).toMatchObject({ value: "On", note: "Not checked on the live page" });
    expect(JSON.stringify([analyticsFacts(CONNECTED_GA4, "2026-11-02", true), analyticsFacts(CONNECTED_GA4, null, false)])).not.toMatch(/seen/i);
    expect(analyticsFacts(CONNECTED_GA4, "2026-11-02", false).map((fact) => fact.label)).toEqual(["Property", "Measurement ID", "Tag on the live site", "Last data day"]);
    expect(analyticsFacts(row({ source: "ga4", externalId: "412345678" }), null, false)[1]).toEqual({ label: "Measurement ID", value: "Not made yet", figure: false });
  });
});

describe("links", () => {
  it("builds the two Google links and refuses an id that is not a property number", () => {
    expect(searchConsoleLink(SITE)).toBe("https://search.google.com/search-console?resource_id=https%3A%2F%2Fomsweets.in%2F");
    expect(analyticsLink("412345678")).toBe("https://analytics.google.com/analytics/web/#/p412345678/reports/intelligenthome");
    expect(analyticsLink("412/../x")).toBeNull();
    expect(hostOfSite(SITE)).toBe("omsweets.in");
    expect(hostOfSite("sc-domain:omsweets.in")).toBe("omsweets.in");
    expect(hostOfSite("nonsense")).toBeNull();
  });
});

describe("googleCallout", () => {
  const callout = (state: Parameters<typeof googleCallout>[0]["state"], gsc: ReportSourceRow | null, ga4: ReportSourceRow | null = null, hostname: string | null = "omsweets.in") => googleCallout({ state, gsc, ga4, hostname, now: NOW });
  it("says nothing when both halves are connected", () => {
    expect(callout("connected", CONNECTED_GSC, CONNECTED_GA4)).toBeNull();
  });
  it("names the host being waited on while setting up, and nothing once Search Console is verified", () => {
    expect(callout("setting-up", row())?.text).toBe("Waiting for Google to see the verification tag on omsweets.in. We look again every 15 minutes and flag it here after 3 days.");
    expect(callout("setting-up", row({ status: "pending", verifiedAt: NOW }))).toBeNull();
  });
  it("counts days from when the site was added and quotes the job's last note when stuck", () => {
    const stuck = callout("needs-look", row({ createdAt: daysAgo(4), detail: "Google has not seen the tag yet" }));
    expect(stuck).toEqual({ tone: "bad", text: "Google still cannot see the tag on omsweets.in, 4 days after the site was added. Check that the live page shows the tag, then retry.", detail: "Google has not seen the tag yet" });
  });
  it("says which half lost access, with its note", () => {
    expect(callout("needs-look", CONNECTED_GSC, row({ source: "ga4", status: "access_lost", detail: "Access was revoked" }))).toEqual({ tone: "bad", text: "Google no longer allows access to this client's Analytics.", detail: "Access was revoked" });
    expect(callout("needs-look", row({ status: "access_lost" }))?.text).toBe("Google no longer allows access to this client's Search Console.");
  });
  it("explains a free address, a missing setup and a detached card", () => {
    expect(callout("free-address", null, null, "omsweets.sites.brandbasket.in")?.text).toBe("Not added: free addresses are never indexed. This site is on omsweets.sites.brandbasket.in. Google is added when the client moves to their own domain.");
    expect(callout("not-added", null)?.text).toContain("Nothing added yet");
    expect(callout("detached", row({ status: "removed" }))?.text).toContain("Detached by staff");
  });
  it("uses no em or en dash", () => {
    const all = [callout("setting-up", row()), callout("needs-look", row({ createdAt: daysAgo(4) })), callout("free-address", null), callout("not-added", null), callout("detached", row({ status: "removed" }))];
    expect(JSON.stringify(all)).not.toMatch(/[–—]/);
  });
});

describe("googleButtons", () => {
  const buttons = (state: Parameters<typeof googleButtons>[0]["state"], gsc: ReportSourceRow | null, ga4: ReportSourceRow | null, canManage = true) => googleButtons({ state, gsc, ga4, canManage });
  it("offers Retry verification only while Search Console is unverified and not lost", () => {
    expect(buttons("setting-up", row(), null).retry).toBe(true);
    expect(buttons("connected", CONNECTED_GSC, CONNECTED_GA4).retry).toBe(false);
    expect(buttons("needs-look", row({ status: "access_lost" }), null).retry).toBe(false);
  });
  it("offers Provision now only on a detached card, and no Detach there", () => {
    expect(buttons("detached", row({ status: "removed" }), null)).toEqual({ openSearchConsole: null, openAnalytics: null, openLiveSite: null, retry: false, detach: false, provisionNow: true });
    for (const state of ["connected", "setting-up", "needs-look"] as const) expect(buttons(state, CONNECTED_GSC, CONNECTED_GA4).provisionNow).toBe(false);
  });
  it("opens the live site only when stuck, and links to both Google tools", () => {
    const stuck = buttons("needs-look", row({ createdAt: daysAgo(4) }), CONNECTED_GA4);
    expect([stuck.openLiveSite, stuck.openSearchConsole, stuck.openAnalytics]).toEqual(["https://omsweets.in/", searchConsoleLink(SITE), analyticsLink("412345678")]);
    expect(buttons("setting-up", row(), null).openLiveSite).toBeNull();
  });
  it("has no buttons on a free address or an empty card", () => {
    expect(Object.values(buttons("free-address", null, null)).some((value) => value !== null && value !== false)).toBe(false);
    expect(Object.values(buttons("not-added", null, null)).some((value) => value !== null && value !== false)).toBe(false);
  });
  it("leaves the actions off for support staff and keeps the links", () => {
    const readOnly = buttons("needs-look", row({ createdAt: daysAgo(4) }), CONNECTED_GA4, false);
    expect([readOnly.retry, readOnly.detach, readOnly.provisionNow]).toEqual([false, false, false]);
    expect(readOnly.openSearchConsole).not.toBeNull();
    expect(buttons("detached", row({ status: "removed" }), null, false).provisionNow).toBe(false);
  });
});

describe("canManageGoogle", () => {
  it("lets admin and finance act and keeps support read only", () => {
    expect([canManageGoogle("admin"), canManageGoogle("finance"), canManageGoogle("support")]).toEqual([true, true, false]);
  });
});
