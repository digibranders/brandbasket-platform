/**
 * Geometry for the Journey map: one curve across the page, and where each avatar sits on it.
 *
 * Everything is in fractions of the map (0–1) or percentages, so the map scales with the window and the server can
 * work out every position without knowing the viewport.
 */

/** Avatars shown per stage before the rest fold into a "+N" bubble. */
export const BAND_CAPACITY = 6;

/** Space kept clear at each side of a band, as a fraction of the band, so avatars never sit on a divider. */
const BAND_PADDING = 0.12;

/**
 * How far avatars step above and below the path, as a fraction of the map's height. Alternating neighbours is what
 * lets six avatars share a narrow band without overlapping, and it keeps the stage from reading as a queue.
 */
export const ZIGZAG = 0.065;

/**
 * The path's height at `x` (both 0–1): a gentle climb from Leads up to Live with a soft wave along the way, kept
 * inside the middle of the map so the stage labels above and the dock below never crowd it.
 */
export function pathY(x: number): number {
  return 0.62 - 0.22 * x + 0.08 * Math.sin(x * Math.PI * 3);
}

/** The path as SVG `d` for a `width`×`height` viewBox, sampled finely enough to look smooth. */
export function pathD(width: number, height: number, steps = 96): string {
  const points: string[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const x = step / steps;
    points.push(`${(x * width).toFixed(1)} ${(pathY(x) * height).toFixed(1)}`);
  }
  return `M${points.join(" L")}`;
}

export interface MapSpot {
  readonly leftPct: number;
  readonly topPct: number;
}

export interface Placed<T> extends MapSpot {
  readonly item: T;
}

export interface PlacedBand<T> {
  readonly placed: readonly Placed<T>[];
  /** How many items did not get a place. */
  readonly overflow: number;
  /** Where the "+N" bubble goes, or null when everything fits. */
  readonly overflowAt: MapSpot | null;
}

function spotAt(band: number, bands: number, slot: number, slots: number): MapSpot {
  const start = (band + BAND_PADDING) / bands;
  const end = (band + 1 - BAND_PADDING) / bands;
  // One item sits in the middle of its band on the path; more spread evenly along the band, stepping above and
  // below the line in turn.
  if (slots === 1) {
    const x = (start + end) / 2;
    return { leftPct: x * 100, topPct: pathY(x) * 100 };
  }
  const x = start + ((end - start) * slot) / (slots - 1);
  const step = slot % 2 === 0 ? -ZIGZAG : ZIGZAG;
  return { leftPct: x * 100, topPct: (pathY(x) + step) * 100 };
}

/**
 * Places a band's items along its slice of the path, in the order given. When there are more than `capacity`, the
 * last place goes to a "+N" bubble, so the band never holds more than `capacity` marks.
 */
export function placeBand<T>(
  items: readonly T[],
  band: number,
  bands: number,
  capacity: number = BAND_CAPACITY,
): PlacedBand<T> {
  const overflowing = items.length > capacity;
  const shown = overflowing ? items.slice(0, capacity - 1) : items;
  const slots = overflowing ? capacity : shown.length;
  const placed = shown.map((item, slot) => ({ item, ...spotAt(band, bands, slot, slots) }));
  return {
    placed,
    overflow: overflowing ? items.length - shown.length : 0,
    overflowAt: overflowing ? spotAt(band, bands, capacity - 1, slots) : null,
  };
}
