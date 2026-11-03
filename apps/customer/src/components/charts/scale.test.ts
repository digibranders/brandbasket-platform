import { describe, expect, it } from "vitest";
import { barShare, formatChartValue, labelEvery, nearestIndex, niceStep, sparkPoints, valueScale, xPositions } from "./scale";

describe("niceStep", () => {
  it("rounds up to 1, 2 or 5 times a power of ten", () => {
    expect([0.7, 1, 1.4, 3, 7, 12, 260, 4_100].map(niceStep)).toEqual([1, 1, 2, 5, 10, 20, 500, 5_000]);
  });

  it("treats nothing, a negative and infinity as 1", () => {
    expect([0, -4, Number.POSITIVE_INFINITY].map(niceStep)).toEqual([1, 1, 1]);
  });
});

describe("valueScale", () => {
  it("starts at zero and rounds the top out to a whole step", () => {
    const scale = valueScale([3, 17, 9], { top: 10, bottom: 210 });
    expect(scale.ticks).toEqual([0, 5, 10, 15, 20]);
    expect(scale.y(0)).toBe(210);
    expect(scale.y(20)).toBe(10);
    expect(scale.y(10)).toBe(110);
  });

  it("can leave zero out", () => {
    expect(valueScale([92, 97], { top: 0, bottom: 100, zero: false }).ticks).toEqual([92, 94, 96, 98]);
  });

  it("plots 1 at the top for ranks", () => {
    const scale = valueScale([1, 8, 20], { top: 0, bottom: 100, invert: true });
    expect(scale.y(scale.min)).toBe(0);
    expect(scale.y(scale.max)).toBe(100);
    expect(scale.y(1)).toBeLessThan(scale.y(8));
  });

  it("draws a flat series in the middle of a one step axis", () => {
    const scale = valueScale([0, 0, 0], { top: 0, bottom: 100 });
    expect(scale.ticks).toEqual([0, 1]);
    expect(scale.y(0)).toBe(100);
  });

  it("keeps decimal steps exact", () => {
    expect(valueScale([0.3], { top: 0, bottom: 100, gaps: 3 }).ticks).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it("refuses an empty series", () => {
    expect(() => valueScale([], { top: 0, bottom: 100 })).toThrow(RangeError);
  });
});

describe("positions", () => {
  it("spreads points from edge to edge, and centres a single point", () => {
    expect(xPositions(3, 10, 30)).toEqual([10, 20, 30]);
    expect(xPositions(1, 10, 30)).toEqual([20]);
  });

  it("finds the nearest point to a column", () => {
    expect(nearestIndex([10, 20, 30], 24)).toBe(1);
    expect(nearestIndex([10, 20, 30], 400)).toBe(2);
  });

  it("labels at most six points", () => {
    expect([6, 7, 30].map((count) => labelEvery(count))).toEqual([1, 2, 5]);
  });
});

describe("sparkPoints and barShare", () => {
  it("fills the box with one pixel clear at the top and bottom", () => {
    expect(sparkPoints([0, 5, 10], 72, 24)).toBe("0,23 36,12 72,1");
    expect(sparkPoints([4, 4], 72, 24)).toBe("0,23 72,23");
    expect(sparkPoints([], 72, 24)).toBe("");
  });

  it("measures bars against the longest", () => {
    expect([barShare(5, 10), barShare(10, 10), barShare(-1, 10), barShare(3, 0)]).toEqual([50, 100, 0, 0]);
  });
});

describe("formatChartValue", () => {
  it("writes counts, shares and money through the app's formats", () => {
    expect(formatChartValue(1234567)).toBe("12,34,567");
    expect(formatChartValue(12.5, "percent")).toBe("12.5%");
    expect(formatChartValue(299_900, { money: "INR" })).toBe("₹2,999");
  });
});
