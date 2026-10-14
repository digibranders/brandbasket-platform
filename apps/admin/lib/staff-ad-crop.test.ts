import { describe, expect, it } from "vitest";
import { autoFocal, bigEnough, CENTRE, coverRect, dragFocal, encodeWithin, type LumaGrid } from "./staff-ad-crop";

const WIDE = { width: 960, height: 600 };

describe("coverRect", () => {
  it("scales a landscape picture to the shape's height and centres the spare width", () => {
    const rect = coverRect({ width: 2000, height: 1000 }, WIDE, CENTRE);
    expect(rect).toEqual({ x: (960 - 1200) / 2, y: 0, width: 1200, height: 600 });
  });

  it("scales a portrait picture to the shape's width and centres the spare height", () => {
    expect(coverRect({ width: 600, height: 1200 }, WIDE, CENTRE)).toEqual({ x: 0, y: (600 - 1920) / 2, width: 960, height: 1920 });
  });

  it("shows the left edge at 0 and the right edge at 1, and clamps a focal point outside", () => {
    const source = { width: 2000, height: 1000 };
    expect(coverRect(source, WIDE, { x: 0, y: 0.5 }).x).toBe(0);
    expect(coverRect(source, WIDE, { x: 1, y: 0.5 }).x).toBe(960 - 1200);
    expect(coverRect(source, WIDE, { x: 7, y: -3 })).toEqual(coverRect(source, WIDE, { x: 1, y: 0 }));
  });

  it("refuses a picture with no size", () => {
    expect(() => coverRect({ width: 0, height: 10 }, WIDE, CENTRE)).toThrow(RangeError);
  });
});

describe("dragFocal", () => {
  const source = { width: 2000, height: 1000 };

  it("moves the picture with the pointer, within the spare width", () => {
    // Dragging 60 canvas pixels left moves the picture left: the focal point goes toward the right edge.
    expect(dragFocal(source, WIDE, CENTRE, -60, 0).x).toBeCloseTo((-120 - 60) / -240);
    expect(dragFocal(source, WIDE, CENTRE, 60, 0).x).toBeCloseTo((-120 + 60) / -240);
  });

  it("stops at the edges", () => {
    expect(dragFocal(source, WIDE, CENTRE, 5000, 0).x).toBe(0);
    expect(dragFocal(source, WIDE, CENTRE, -5000, 0).x).toBe(1);
  });

  it("cannot move a direction the picture exactly fills", () => {
    expect(dragFocal(source, WIDE, { x: 0.5, y: 0.2 }, 0, 80).y).toBe(0.2);
  });
});

describe("bigEnough", () => {
  it("accepts a picture at least half the shape's size each way and refuses a smaller one", () => {
    expect(bigEnough({ width: 480, height: 300 }, WIDE)).toBe(true);
    expect(bigEnough({ width: 479, height: 600 }, WIDE)).toBe(false);
    expect(bigEnough({ width: 4000, height: 299 }, WIDE)).toBe(false);
  });
});

describe("autoFocal", () => {
  /** A greyscale grid whose pixels are `value(x, y)`. */
  function grid(width: number, height: number, value: (x: number, y: number) => number): LumaGrid {
    const luma = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) luma[y * width + x] = value(x, y);
    return { width, height, luma };
  }
  const TALL = { width: 960, height: 1080 };
  /** Plain except for a busy checkerboard patch. */
  const patch = (x0: number, x1: number, y0: number, y1: number) => (x: number, y: number) =>
    x >= x0 && x < x1 && y >= y0 && y < y1 ? ((x + y) % 2 === 0 ? 255 : 0) : 120;

  it("points a wide crop of a wide picture at the busy side, whichever side it is", () => {
    // 64 x 24 is wider than the 960 x 600 spot, so there is room to slide sideways.
    expect(autoFocal(grid(64, 24, patch(50, 64, 0, 24)), WIDE).x).toBeGreaterThan(0.8);
    expect(autoFocal(grid(64, 24, patch(0, 14, 0, 24)), WIDE).x).toBeLessThan(0.2);
    expect(autoFocal(grid(64, 24, patch(0, 14, 0, 24)), WIDE).y).toBe(0.5);
  });

  it("points a tall crop of a tall picture at the busy part, top or bottom", () => {
    expect(autoFocal(grid(24, 64, patch(0, 24, 50, 64)), TALL).y).toBeGreaterThan(0.8);
    expect(autoFocal(grid(24, 64, patch(0, 24, 0, 14)), TALL).y).toBeLessThan(0.2);
    expect(autoFocal(grid(24, 64, patch(0, 24, 0, 14)), TALL).x).toBe(0.5);
  });

  it("stays in the middle for a picture of the spot's own shape, an even picture, or a busy middle", () => {
    expect(autoFocal(grid(96, 60, patch(0, 96, 0, 60)), WIDE)).toEqual({ x: 0.5, y: 0.5 });
    expect(autoFocal(grid(64, 24, () => 90), WIDE)).toEqual({ x: 0.5, y: 0.5 });
    expect(autoFocal(grid(64, 24, patch(24, 40, 0, 24)), WIDE).x).toBeCloseTo(0.5, 1);
  });

  it("gives up gracefully on a grid too small to read", () => {
    expect(autoFocal({ width: 1, height: 1, luma: [0] }, WIDE)).toEqual({ x: 0.5, y: 0.5 });
    expect(autoFocal({ width: 8, height: 8, luma: [] }, WIDE)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("encodeWithin", () => {
  const sizes = (bySize: Record<number, number>) => async (quality: number) => ({ size: bySize[quality] ?? 999_999, quality });

  it("stops at the first quality that fits", async () => {
    const seen: number[] = [];
    const result = await encodeWithin(async (quality) => (seen.push(quality), { size: quality > 0.8 ? 400_000 : 90_000, quality }));
    expect(result).toEqual({ size: 90_000, quality: 0.78 });
    expect(seen).toEqual([0.86, 0.78]);
  });

  it("returns the smallest when none fits, and nothing when the picture cannot be encoded", async () => {
    expect(await encodeWithin(sizes({ 0.86: 500_000, 0.78: 400_000, 0.7: 300_000, 0.62: 350_000 }))).toEqual({ size: 300_000, quality: 0.7 });
    expect(await encodeWithin(async () => null)).toBeNull();
  });

  it("keeps a picture that already fits at the best quality", async () => {
    expect(await encodeWithin(sizes({ 0.86: 40_000 }))).toEqual({ size: 40_000, quality: 0.86 });
  });
});
