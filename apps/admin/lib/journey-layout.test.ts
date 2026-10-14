import { describe, expect, it } from "vitest";
import { BAND_CAPACITY, pathD, pathY, placeBand, ZIGZAG } from "./journey-layout";

describe("pathY", () => {
  it("stays inside the map's middle band everywhere", () => {
    for (let step = 0; step <= 100; step += 1) {
      const y = pathY(step / 100);
      expect(y).toBeGreaterThanOrEqual(0.28);
      expect(y).toBeLessThanOrEqual(0.72);
    }
  });
});

describe("pathD", () => {
  it("draws from the left edge to the right edge", () => {
    const d = pathD(1000, 400, 10);
    expect(d.startsWith("M0.0 ")).toBe(true);
    expect(d).toContain(" L1000.0 ");
  });
});

describe("placeBand", () => {
  const items = (count: number): string[] => Array.from({ length: count }, (_, index) => `item-${index}`);

  it("places every item when the band has room", () => {
    const band = placeBand(items(3), 1, 5);
    expect(band.placed.map((spot) => spot.item)).toEqual(["item-0", "item-1", "item-2"]);
    expect(band.overflow).toBe(0);
    expect(band.overflowAt).toBeNull();
  });

  it("keeps the last place for a +N bubble when the band overflows", () => {
    const band = placeBand(items(BAND_CAPACITY + 4), 4, 5);
    expect(band.placed).toHaveLength(BAND_CAPACITY - 1);
    expect(band.overflow).toBe(5);
    expect(band.overflowAt).not.toBeNull();
  });

  it("fills a band exactly without a bubble", () => {
    const band = placeBand(items(BAND_CAPACITY), 0, 5);
    expect(band.placed).toHaveLength(BAND_CAPACITY);
    expect(band.overflow).toBe(0);
  });

  it("keeps every spot inside its own band, clear of the dividers", () => {
    const band = placeBand(items(BAND_CAPACITY + 2), 2, 5);
    const spots = [...band.placed, ...(band.overflowAt === null ? [] : [band.overflowAt])];
    for (const spot of spots) {
      expect(spot.leftPct).toBeGreaterThan(40);
      expect(spot.leftPct).toBeLessThan(60);
    }
  });

  it("sits a lone avatar right on the path", () => {
    const [spot] = placeBand(items(1), 3, 5).placed;
    expect(spot?.topPct).toBeCloseTo(pathY((spot?.leftPct ?? 0) / 100) * 100, 6);
  });

  it("steps neighbours above and below the path so they never overlap", () => {
    const band = placeBand(items(4), 3, 5);
    const offsets = band.placed.map((spot) => spot.topPct - pathY(spot.leftPct / 100) * 100);
    expect(offsets.map((offset) => Math.sign(offset))).toEqual([-1, 1, -1, 1]);
    for (const offset of offsets) expect(Math.abs(offset)).toBeCloseTo(ZIGZAG * 100, 6);
  });

  it("keeps every spot well inside the map vertically", () => {
    for (let band = 0; band < 5; band += 1) {
      const { placed, overflowAt } = placeBand(items(BAND_CAPACITY + 1), band, 5);
      for (const spot of [...placed, ...(overflowAt === null ? [] : [overflowAt])]) {
        expect(spot.topPct).toBeGreaterThan(20);
        expect(spot.topPct).toBeLessThan(80);
      }
    }
  });

  it("keeps the caller's order, so attention items placed first stay first", () => {
    const band = placeBand(["urgent", "calm"], 0, 5);
    const [first, second] = band.placed;
    expect(first?.item).toBe("urgent");
    expect(second?.item).toBe("calm");
    expect((first?.leftPct ?? 0) < (second?.leftPct ?? 0)).toBe(true);
  });

  it("returns nothing for an empty band", () => {
    const band = placeBand([], 1, 5);
    expect(band.placed).toEqual([]);
    expect(band.overflow).toBe(0);
  });
});
