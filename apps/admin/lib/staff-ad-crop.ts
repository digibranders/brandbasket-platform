/*
 * Cutting a picture to an ad spot's shape in the browser, the way the owners' crop window does: the picture is scaled
 * until it covers the shape and the part that shows is chosen by a focal point (0 to 1 each way, the middle by default).
 * Pure arithmetic, so it is tested without a canvas.
 */

export interface CropSize {
  readonly width: number;
  readonly height: number;
}

/** Which part of the picture shows: 0 is its left (top) edge, 1 its right (bottom) edge. */
export interface Focal {
  readonly x: number;
  readonly y: number;
}

export const CENTRE: Focal = { x: 0.5, y: 0.5 };

/** The smallest source, as a fraction of the spot's width, that is not enlarged more than twice. */
export const MIN_SOURCE_FRACTION = 0.5;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Zero for negative zero, so a picture drawn at the edge reads as 0. */
function plain(value: number): number {
  return value === 0 ? 0 : value;
}

/** Where the scaled picture is drawn on a canvas of `target` size: it covers the canvas, and `focal` picks the part that shows. */
export function coverRect(source: CropSize, target: CropSize, focal: Focal): { x: number; y: number; width: number; height: number } {
  if (source.width <= 0 || source.height <= 0) throw new RangeError("A picture has a width and a height");
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: plain((target.width - width) * clamp01(focal.x)), y: plain((target.height - height) * clamp01(focal.y)), width, height };
}

/** The focal point after the picture is dragged by (`dx`, `dy`) canvas pixels; a direction with nothing to spare does not move. */
export function dragFocal(source: CropSize, target: CropSize, focal: Focal, dx: number, dy: number): Focal {
  const rect = coverRect(source, target, focal);
  const spareX = target.width - rect.width;
  const spareY = target.height - rect.height;
  return {
    x: spareX === 0 ? focal.x : clamp01((rect.x + dx) / spareX),
    y: spareY === 0 ? focal.y : clamp01((rect.y + dy) / spareY),
  };
}

/** Whether the picture is big enough: enlarging it more than twice would show as blur. */
export function bigEnough(source: CropSize, target: CropSize): boolean {
  return source.width >= target.width * MIN_SOURCE_FRACTION && source.height >= target.height * MIN_SOURCE_FRACTION;
}

// ---------------------------------------------------------------------------------------------------------------
// Auto-optimize: choose the part that shows, and keep the file small, without staff doing either by hand
// ---------------------------------------------------------------------------------------------------------------

/** A small greyscale copy of a picture: `luma` holds `width * height` values from 0 to 255, row by row. */
export interface LumaGrid {
  readonly width: number;
  readonly height: number;
  readonly luma: ArrayLike<number>;
}

/** How many positions the part that shows is tried at along the direction that has room to move. */
const AUTO_STEPS = 20;
/** How much a position at the very edge is marked down against the middle, so a tie goes to the middle and a faint lead does not hug the edge. */
const EDGE_PENALTY = 0.12;

/**
 * Where to point the crop so the part that shows has the most going on in it: the picture is scaled to cover the spot
 * (as `coverRect` does), and the window that is left is slid along the one direction with room to spare, keeping the
 * position whose pixels change the most (edges and texture, which is where a photo's subject usually is, rather than
 * a blank wall or sky). A picture of the spot's own shape, or an even one, stays in the middle. Staff can still drag it.
 */
export function autoFocal(grid: LumaGrid, target: CropSize): Focal {
  const { width, height } = grid;
  if (width < 2 || height < 2 || grid.luma.length < width * height) return CENTRE;
  const scale = Math.max(target.width / width, target.height / height);
  const windowWidth = target.width / scale;
  const windowHeight = target.height / scale;
  const roomX = width - windowWidth;
  const roomY = height - windowHeight;
  if (roomX < 0.5 && roomY < 0.5) return CENTRE;

  // A summed-area table of how much each pixel differs from the one beside it and the one below it.
  const stride = width + 1;
  const table = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      const here = grid.luma[y * width + x] ?? 0;
      const right = x + 1 < width ? (grid.luma[y * width + x + 1] ?? here) : here;
      const below = y + 1 < height ? (grid.luma[(y + 1) * width + x] ?? here) : here;
      row += Math.abs(here - right) + Math.abs(here - below);
      table[(y + 1) * stride + x + 1] = (table[y * stride + x + 1] ?? 0) + row;
    }
  }
  const energyIn = (left: number, top: number, w: number, h: number): number => {
    const x0 = Math.round(left);
    const y0 = Math.round(top);
    const x1 = Math.min(width, Math.max(x0 + 1, Math.round(left + w)));
    const y1 = Math.min(height, Math.max(y0 + 1, Math.round(top + h)));
    return (table[y1 * stride + x1] ?? 0) - (table[y0 * stride + x1] ?? 0) - (table[y1 * stride + x0] ?? 0) + (table[y0 * stride + x0] ?? 0);
  };

  const slidesAcross = roomX >= roomY;
  // Middle first, so that of equal scores the one nearest the middle wins.
  const positions = Array.from({ length: AUTO_STEPS + 1 }, (_, step) => step / AUTO_STEPS).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5));
  let best = 0.5;
  let bestScore = -1;
  for (const position of positions) {
    const energy = slidesAcross ? energyIn(roomX * position, 0, windowWidth, height) : energyIn(0, roomY * position, width, windowHeight);
    const score = energy * (1 - EDGE_PENALTY * Math.abs(position - 0.5) * 2);
    if (score > bestScore) {
      bestScore = score;
      best = position;
    }
  }
  return bestScore <= 0 ? CENTRE : slidesAcross ? { x: best, y: 0.5 } : { x: 0.5, y: best };
}

/** The WebP qualities tried in turn, best first, when a picture is encoded to keep the file small. */
export const AUTO_QUALITIES: readonly number[] = [0.86, 0.78, 0.7, 0.62];
/** A cut picture this size or smaller needs no more squeezing: it loads fast, and sits far under a server action's 1 MB. */
export const AUTO_TARGET_BYTES = 150_000;

/**
 * Encodes at each quality in turn and returns the first result no larger than `targetBytes`, else the smallest one
 * made. `encode` returns null when it cannot encode at all, which ends the attempt with null.
 */
export async function encodeWithin<T extends { readonly size: number }>(
  encode: (quality: number) => Promise<T | null>,
  qualities: readonly number[] = AUTO_QUALITIES,
  targetBytes: number = AUTO_TARGET_BYTES,
): Promise<T | null> {
  let smallest: T | null = null;
  for (const quality of qualities) {
    const result = await encode(quality);
    if (result === null) return null;
    if (result.size <= targetBytes) return result;
    if (smallest === null || result.size < smallest.size) smallest = result;
  }
  return smallest;
}
