import { describe, expect, it } from "vitest";
import { daysWithoutData, googleAttentionCutoffs, googleAttentionItems, googleSignInItems, NO_DATA_DAYS } from "./google-today";

const NOW = new Date("2026-11-03T04:00:00.000Z");
const DAY = 86_400_000;

describe("googleAttentionCutoffs", () => {
  it("reads a day from the Kolkata calendar and allows each pull its usual lag", () => {
    expect(googleAttentionCutoffs(NOW)).toEqual({
      unverifiedBefore: new Date(NOW.getTime() - 3 * DAY),
      // Analytics should reach yesterday (2 Nov): listed once its newest day is 3 or more days behind that, so before 31 Oct.
      ga4DataBefore: "2026-10-31",
      // Search Console should reach 31 Oct: before 29 Oct.
      gscDataBefore: "2026-10-29",
    });
  });

  it("uses India's date near midnight UTC", () => {
    expect(googleAttentionCutoffs(new Date("2026-11-03T20:00:00.000Z")).ga4DataBefore).toBe("2026-11-01");
  });
});

describe("daysWithoutData", () => {
  it("is zero for a source that is up to date and counts days behind the day its pull should have reached", () => {
    expect(daysWithoutData("ga4", "2026-11-02", NOW)).toBe(0);
    expect(daysWithoutData("gsc", "2026-10-31", NOW)).toBe(0);
    expect(daysWithoutData("ga4", "2026-10-30", NOW)).toBe(3);
    expect(daysWithoutData("gsc", "2026-10-28", NOW)).toBe(3);
    expect(daysWithoutData("gsc", "2026-11-05", NOW)).toBe(0);
  });

  it("agrees with the cutoffs: the newest listed day is the one that is exactly the tolerance behind", () => {
    const cutoffs = googleAttentionCutoffs(NOW);
    const justBefore = (cutoff: string): string => new Date(Date.parse(`${cutoff}T00:00:00Z`) - DAY).toISOString().slice(0, 10);
    expect(daysWithoutData("ga4", justBefore(cutoffs.ga4DataBefore), NOW)).toBe(NO_DATA_DAYS);
    expect(daysWithoutData("gsc", justBefore(cutoffs.gscDataBefore), NOW)).toBe(NO_DATA_DAYS);
    expect(daysWithoutData("ga4", cutoffs.ga4DataBefore, NOW)).toBe(NO_DATA_DAYS - 1);
  });
});

describe("googleAttentionItems", () => {
  const since = new Date(NOW.getTime() - 4 * DAY);
  it("words an unverified site with its client, age and a Retry verification button to the Website tab", () => {
    const [item] = googleAttentionItems([{ kind: "unverified", businessId: "b1", businessName: "Om Sweets", since }], NOW);
    expect(item).toEqual({
      key: "google:unverified:b1",
      kind: "google",
      href: "/clients/b1/website?google=look#google",
      title: "Om Sweets: Google cannot see the verification tag",
      detail: "Not verified 4 days after the site was added.",
      action: "Retry verification",
      dueAt: new Date(since.getTime() + 3 * DAY),
    });
  });

  it("words a silent source with the client, the days and an Open client button, and claims nothing about a tag", () => {
    const [item] = googleAttentionItems([{ kind: "no-data", businessId: "b2", businessName: "Kulkarni Physio", source: "ga4", latestDay: "2026-10-29" }], NOW);
    expect(item).toMatchObject({ key: "google:no-data:b2:ga4", href: "/clients/b2", title: "Kulkarni Physio: no Google data for 4 days", action: "Open client" });
    expect(item?.detail).toBe("Analytics is connected. Its newest day is 29 October 2026.");
    expect(item?.detail).not.toMatch(/tag/i);
  });

  it("never says fewer than three days, and makes one item per source", () => {
    const rows = googleAttentionItems(
      [
        { kind: "no-data", businessId: "b2", businessName: "Kulkarni Physio", source: "gsc", latestDay: "2026-10-28" },
        { kind: "no-data", businessId: "b2", businessName: "Kulkarni Physio", source: "ga4", latestDay: "2026-10-30" },
      ],
      NOW,
    );
    expect(rows.map((row) => row.key)).toEqual(["google:no-data:b2:gsc", "google:no-data:b2:ga4"]);
    expect(rows.map((row) => row.title)).toEqual(["Kulkarni Physio: no Google data for 3 days", "Kulkarni Physio: no Google data for 3 days"]);
  });

  it("is empty when nothing is wrong and uses no em or en dash", () => {
    expect(googleAttentionItems([], NOW)).toEqual([]);
    const all = googleAttentionItems([{ kind: "unverified", businessId: "b1", businessName: "Om Sweets", since }, { kind: "no-data", businessId: "b2", businessName: "K", source: "gsc", latestDay: "2026-10-20" }], NOW);
    expect(JSON.stringify(all)).not.toMatch(/[–—]/);
  });
});

describe("googleSignInItems", () => {
  const lost = new Date("2026-11-03T01:00:00.000Z");
  it("is empty while every sign-in is connected", () => {
    expect(googleSignInItems([{ purpose: "read", status: "connected", updatedAt: lost }, { purpose: "write", status: "connected", updatedAt: lost }])).toEqual([]);
    expect(googleSignInItems([])).toEqual([]);
  });

  it("raises one item with an Open Settings button when the reading sign-in is lost", () => {
    const items = googleSignInItems([{ purpose: "read", status: "access_lost", updatedAt: lost }, { purpose: "write", status: "connected", updatedAt: NOW }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "google:sign-in", kind: "google", href: "/settings#google", title: "Brandbasket Google sign-in was lost", action: "Open Settings", dueAt: lost });
    expect(items[0]?.detail).toBe("The reading sign-in was refused by Google. Nothing is pulled until it is connected again. Refused on 3 Nov.");
  });

  it("says what stops when the setting-up sign-in is lost, and stays one item when both are", () => {
    expect(googleSignInItems([{ purpose: "write", status: "access_lost", updatedAt: lost }])[0]?.detail).toContain("New sites are not set up");
    const both = googleSignInItems([{ purpose: "read", status: "access_lost", updatedAt: NOW }, { purpose: "write", status: "access_lost", updatedAt: lost }]);
    expect(both).toHaveLength(1);
    expect(both[0]?.dueAt).toEqual(lost);
    expect(both[0]?.detail).toContain("Both sign-ins");
  });
});
