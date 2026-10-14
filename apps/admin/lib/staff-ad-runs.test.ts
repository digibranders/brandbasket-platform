import { describe, expect, it } from "vitest";
import type { StaffAd } from "@fynix/db";
import { formatRunRange, groupStaffAdRuns } from "./staff-ad-runs";

function ad(id: string, weekStart: string, overrides: Partial<StaffAd> = {}): StaffAd {
  return {
    id,
    listingKey: null,
    linkUrl: "https://example.com/offer",
    pictureId: null,
    businessName: "Free check-up camp",
    tagline: null,
    categorySlug: "dentists",
    citySlug: "thane",
    areaSlug: "naupada",
    placement: "side",
    spot: 1,
    weekStart,
    agreedPaise: null,
    note: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("groupStaffAdRuns", () => {
  it("lists eight weeks in a row as one booking that a single take-down removes", () => {
    const weeks = ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"];
    const runs = groupStaffAdRuns(weeks.map((week, index) => ad(`a${index}`, week)));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ firstWeek: "2026-10-12", lastWeek: "2026-11-30", weeks: 8, ids: weeks.map((_, index) => `a${index}`) });
  });

  it("starts another booking after a gap, and for a different spot or a different ad", () => {
    const runs = groupStaffAdRuns([
      ad("a", "2026-10-12"),
      ad("b", "2026-10-19"),
      ad("c", "2026-11-02"),
      ad("d", "2026-10-12", { spot: 2 }),
      ad("e", "2026-10-12", { businessName: "Another headline" }),
    ]);
    expect(runs.map((run) => [run.ad.spot, run.ad.businessName, run.weeks])).toEqual([
      [1, "Free check-up camp", 2],
      [2, "Free check-up camp", 1],
      [1, "Another headline", 1],
      [1, "Free check-up camp", 1],
    ]);
  });

  it("keeps consecutive weeks with different pictures as separate bookings", () => {
    const runs = groupStaffAdRuns([ad("a", "2026-10-12", { pictureId: "p1" }), ad("b", "2026-10-19", { pictureId: "p1" }), ad("c", "2026-10-26", { pictureId: "p2" })]);
    expect(runs.map((run) => [run.ad.pictureId, run.weeks])).toEqual([
      ["p1", 2],
      ["p2", 1],
    ]);
  });

  it("is empty for no ads", () => {
    expect(groupStaffAdRuns([])).toEqual([]);
  });
});

describe("formatRunRange", () => {
  it("runs from the first Monday to the last Sunday", () => {
    expect(formatRunRange("2026-10-12", "2026-11-30")).toBe("12 Oct – 6 Dec");
    expect(formatRunRange("2026-10-12", "2026-10-12")).toBe("12 Oct – 18 Oct");
  });
});
