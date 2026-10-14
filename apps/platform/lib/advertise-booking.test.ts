import { describe, expect, it } from "vitest";
import { placementHeldThrough, spotHeldThrough } from "./advertise-booking";

const held = (placement: "top" | "side" | "home", spot: number, weeks: readonly string[]) => weeks.map((weekStart) => ({ placement, spot, weekStart }));

// Mondays: 5 Oct, 12 Oct, 19 Oct, 26 Oct, 2 Nov, 9 Nov 2026.
const OCT_5 = "2026-10-05";
const OCT_12 = "2026-10-12";
const OCT_19 = "2026-10-19";
const OCT_26 = "2026-10-26";
const NOV_2 = "2026-11-02";
const NOV_9 = "2026-11-09";

describe("spotHeldThrough", () => {
  it("runs to the end of an unbroken booking of several weeks", () => {
    const rows = held("top", 1, [OCT_12, OCT_19, OCT_26, NOV_2]);
    expect(spotHeldThrough(rows, "top", 1, OCT_12)).toBe(NOV_2);
    expect(spotHeldThrough(rows, "top", 1, OCT_26)).toBe(NOV_2);
  });

  it("stops at a gap, so a second booking after a free week is not counted", () => {
    const rows = held("top", 1, [OCT_12, OCT_19, NOV_2, NOV_9]);
    expect(spotHeldThrough(rows, "top", 1, OCT_12)).toBe(OCT_19);
  });

  it("is null for a week staff do not hold, and for another spot or placement", () => {
    const rows = held("side", 2, [OCT_12, OCT_19]);
    expect(spotHeldThrough(rows, "side", 2, OCT_5)).toBeNull();
    expect(spotHeldThrough(rows, "side", 1, OCT_12)).toBeNull();
    expect(spotHeldThrough(rows, "top", 2, OCT_12)).toBeNull();
  });
});

describe("placementHeldThrough", () => {
  it("is closed only while every spot is held", () => {
    const rows = [...held("side", 1, [OCT_12, OCT_19, OCT_26]), ...held("side", 2, [OCT_12, OCT_19])];
    expect(placementHeldThrough(rows, "side", 2, OCT_12)).toBe(OCT_19);
    expect(placementHeldThrough(rows, "side", 2, OCT_26)).toBeNull();
  });

  it("is null while a spot is free, and closed to the end of a one-spot placement's run", () => {
    expect(placementHeldThrough(held("side", 1, [OCT_12]), "side", 2, OCT_12)).toBeNull();
    expect(placementHeldThrough(held("top", 1, [OCT_12, OCT_19, OCT_26]), "top", 1, OCT_12)).toBe(OCT_26);
  });

  it("counts the home page's four tiles", () => {
    const rows = [1, 2, 3, 4].flatMap((spot) => held("home", spot, [OCT_12, OCT_19]));
    expect(placementHeldThrough(rows, "home", 4, OCT_12)).toBe(OCT_19);
    // The fourth tile is held for the first week only, so the placement closes after that week.
    expect(placementHeldThrough(rows.slice(0, 7), "home", 4, OCT_12)).toBe(OCT_12);
    expect(placementHeldThrough(rows.slice(0, 7), "home", 4, OCT_19)).toBeNull();
  });
});
