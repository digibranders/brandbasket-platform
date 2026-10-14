import { describe, expect, it } from "vitest";
import {
  cropBounds,
  cropRect,
  largestCrop,
  MAX_CROP_ZOOM,
  panView,
  startView,
  zoomView,
  type CropBounds,
} from "./crop-geometry";

const SQUARE = { width: 640, height: 640 };
const TALL = { width: 960, height: 1080 };
const WIDE = { width: 960, height: 600 };
const HALF_SQUARE = { width: 320, height: 320 };

function boundsFor(photo: { width: number; height: number }, shape = SQUARE, minimum = HALF_SQUARE): CropBounds {
  const bounds = cropBounds(photo, shape, minimum);
  if (bounds === null) throw new Error("Expected the photo to be large enough");
  return bounds;
}

describe("largestCrop", () => {
  it("uses the photo's full height when the photo is wider than the shape", () => {
    expect(largestCrop({ width: 4000, height: 3000 }, SQUARE)).toEqual({ width: 3000, height: 3000 });
    const tall = largestCrop({ width: 4000, height: 3000 }, TALL);
    expect(tall.height).toBe(3000);
    expect(tall.width).toBeCloseTo(2666.667, 2);
  });

  it("uses the photo's full width when the photo is taller than the shape", () => {
    expect(largestCrop({ width: 1000, height: 2000 }, WIDE)).toEqual({ width: 1000, height: 625 });
  });

  it("is the whole photo when the shapes already match", () => {
    expect(largestCrop({ width: 1920, height: 1200 }, WIDE)).toEqual({ width: 1920, height: 1200 });
  });
});

describe("cropBounds", () => {
  it("refuses a photo whose largest crop is under the minimum", () => {
    expect(cropBounds({ width: 300, height: 900 }, SQUARE, HALF_SQUARE)).toBeNull();
    expect(cropBounds({ width: 900, height: 319 }, SQUARE, HALF_SQUARE)).toBeNull();
    expect(cropBounds({ width: 0, height: 0 }, SQUARE, HALF_SQUARE)).toBeNull();
  });

  it("lets the zoom go as far as the minimum crop allows", () => {
    expect(boundsFor({ width: 800, height: 1000 }).maxZoom).toBe(2.5);
    expect(boundsFor({ width: 320, height: 320 }).maxZoom).toBe(1);
  });

  it("caps the zoom for a very large photo", () => {
    expect(boundsFor({ width: 6000, height: 4000 }).maxZoom).toBe(MAX_CROP_ZOOM);
  });
});

describe("cropRect", () => {
  it("starts as the largest crop, in the middle of the photo", () => {
    const bounds = boundsFor({ width: 4000, height: 3000 });
    expect(cropRect(bounds, startView(bounds))).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
  });

  it("shrinks around its centre as the zoom rises", () => {
    const bounds = boundsFor({ width: 4000, height: 3000 });
    expect(cropRect(bounds, zoomView(bounds, startView(bounds), 2))).toEqual({ x: 1250, y: 750, width: 1500, height: 1500 });
  });

  it("never reaches outside the photo, whatever centre it is given", () => {
    const bounds = boundsFor({ width: 4000, height: 3000 });
    expect(cropRect(bounds, { zoom: 2, centerX: -50, centerY: 99_999 })).toEqual({ x: 0, y: 1500, width: 1500, height: 1500 });
  });
});

describe("zoomView", () => {
  it("keeps the zoom between 1 and the photo's limit", () => {
    const bounds = boundsFor({ width: 800, height: 1000 });
    const start = startView(bounds);
    expect(zoomView(bounds, start, 0.2).zoom).toBe(1);
    expect(zoomView(bounds, start, 9).zoom).toBe(2.5);
    expect(zoomView(bounds, start, Number.NaN).zoom).toBe(1);
  });

  it("pulls the centre back inside when zooming out near an edge", () => {
    const bounds = boundsFor({ width: 4000, height: 3000 });
    const corner = panView(bounds, zoomView(bounds, startView(bounds), 4), 100_000, 100_000, 300);
    expect(cropRect(bounds, corner)).toEqual({ x: 0, y: 0, width: 750, height: 750 });
    expect(cropRect(bounds, zoomView(bounds, corner, 1))).toEqual({ x: 0, y: 0, width: 3000, height: 3000 });
  });
});

describe("panView", () => {
  it("moves the photo with the pointer: dragging right shows more of its left", () => {
    const bounds = boundsFor({ width: 4000, height: 3000 });
    const zoomed = zoomView(bounds, startView(bounds), 2);
    // The frame is 300px wide and shows 1500 photo pixels, so one screen pixel is five photo pixels.
    const moved = panView(bounds, zoomed, 40, -20, 300);
    expect(cropRect(bounds, moved)).toEqual({ x: 1050, y: 850, width: 1500, height: 1500 });
  });

  it("stops at the photo's edge", () => {
    const bounds = boundsFor({ width: 4000, height: 3000 });
    const moved = panView(bounds, startView(bounds), -100_000, 500, 300);
    expect(cropRect(bounds, moved)).toEqual({ x: 1000, y: 0, width: 3000, height: 3000 });
  });

  it("ignores a frame with no width", () => {
    const bounds = boundsFor({ width: 4000, height: 3000 });
    const start = startView(bounds);
    expect(panView(bounds, start, 40, 40, 0)).toEqual(start);
  });
});
