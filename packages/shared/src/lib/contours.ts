/**
 * Generates soft, nested contour rings (like a topographic map) as SVG path data.
 * Output is deterministic for a given seed so server and client renders match.
 */

export interface ContourOptions {
  readonly cx: number;
  readonly cy: number;
  readonly rings: number;
  readonly baseRadius: number;
  readonly spacing: number;
  /** Relative radius variation, from 0 (perfect circles) up to, but not including, 0.5. */
  readonly wobble: number;
  readonly seed: number;
  readonly samples?: number;
}

type Point = readonly [x: number, y: number];

const DEFAULT_SAMPLES = 72;
const MAX_RINGS = 80;
const HARMONICS = [2, 3, 5] as const;

/** Mulberry32: a tiny seeded PRNG returning values in [0, 1). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function assertValidOptions(options: ContourOptions, samples: number): void {
  if (!Number.isInteger(options.rings) || options.rings < 1 || options.rings > MAX_RINGS) {
    throw new RangeError(`rings must be an integer from 1 to ${MAX_RINGS}, received ${options.rings}`);
  }
  if (!Number.isInteger(samples) || samples < 8) {
    throw new RangeError(`samples must be an integer of at least 8, received ${samples}`);
  }
  if (!(options.baseRadius > 0) || !(options.spacing > 0)) {
    throw new RangeError("baseRadius and spacing must be positive numbers");
  }
  if (!(options.wobble >= 0 && options.wobble < 0.5)) {
    throw new RangeError(`wobble must be at least 0 and below 0.5, received ${options.wobble}`);
  }
  if (![options.cx, options.cy, options.seed].every(Number.isFinite)) {
    throw new RangeError("cx, cy and seed must be finite numbers");
  }
}

function formatCoordinate(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** Closed Catmull-Rom spline through the points, expressed as cubic Béziers. */
export function toSmoothClosedPath(points: readonly Point[]): string {
  const count = points.length;
  if (count === 0) throw new RangeError("A closed path needs at least one point");
  const at = (index: number): Point => {
    const point = points[(index + count) % count];
    if (point === undefined) throw new RangeError(`No point at index ${index}`);
    return point;
  };
  const [startX, startY] = at(0);
  let path = `M${formatCoordinate(startX)} ${formatCoordinate(startY)}`;

  for (let index = 0; index < count; index += 1) {
    const [x0, y0] = at(index - 1);
    const [x1, y1] = at(index);
    const [x2, y2] = at(index + 1);
    const [x3, y3] = at(index + 2);
    const control1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6];
    const control2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
    path += `C${control1.map(formatCoordinate).join(" ")} ${control2.map(formatCoordinate).join(" ")} ${formatCoordinate(x2)} ${formatCoordinate(y2)}`;
  }

  return `${path}Z`;
}

export function contourPaths(options: ContourOptions): string[] {
  const samples = options.samples ?? DEFAULT_SAMPLES;
  assertValidOptions(options, samples);

  const random = createRandom(options.seed);
  const waves = HARMONICS.map((frequency) => ({
    frequency,
    amplitude: (options.wobble / HARMONICS.length) * (0.45 + 0.55 * random()),
    phase: random() * Math.PI * 2,
  }));

  const paths: string[] = [];
  for (let ring = 0; ring < options.rings; ring += 1) {
    const radius = options.baseRadius + ring * options.spacing;
    // Outer rings wander a little more; capped so the radius never collapses.
    const growth = Math.min(1.5, 1 + ring * 0.03);
    const points: Point[] = [];

    for (let sample = 0; sample < samples; sample += 1) {
      const angle = (sample / samples) * Math.PI * 2;
      const offset = waves.reduce(
        (sum, wave) =>
          sum + wave.amplitude * growth * Math.sin(wave.frequency * angle + wave.phase + ring * 0.08),
        0,
      );
      const distance = radius * (1 + offset);
      points.push([options.cx + distance * Math.cos(angle), options.cy + distance * Math.sin(angle)]);
    }

    paths.push(toSmoothClosedPath(points));
  }

  return paths;
}

export interface RibbonOptions {
  /** How many parallel lines to draw. */
  readonly lines: number;
  readonly width: number;
  readonly height: number;
  /** Horizontal gap between neighbouring lines before they start to wander. */
  readonly spacing: number;
  /** How far a line may swing from its own column. */
  readonly amplitude: number;
  /** How far the whole band leans across as it falls, giving the lines one long diagonal sweep. */
  readonly sweep?: number;
  readonly seed: number;
  readonly samples?: number;
}

const MAX_LINES = 40;
const RIBBON_HARMONICS = [1, 2.2, 3.4] as const;

/** Open Catmull-Rom spline through the points, expressed as cubic Béziers. */
export function toSmoothOpenPath(points: readonly Point[]): string {
  if (points.length < 2) {
    throw new RangeError(`A path needs at least two points, received ${points.length}`);
  }
  const at = (index: number): Point => points[Math.min(Math.max(index, 0), points.length - 1)] as Point;
  const [startX, startY] = at(0);
  let path = `M${formatCoordinate(startX)} ${formatCoordinate(startY)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = at(index - 1);
    const [x1, y1] = at(index);
    const [x2, y2] = at(index + 1);
    const [x3, y3] = at(index + 2);
    const control1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6];
    const control2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
    path += `C${control1.map(formatCoordinate).join(" ")} ${control2.map(formatCoordinate).join(" ")} ${formatCoordinate(x2)} ${formatCoordinate(y2)}`;
  }

  return path;
}

/**
 * Flowing parallel lines running top to bottom, like a contour map sliced down one edge.
 * Deterministic for a given seed so server and client renders match.
 */
export function ribbonPaths(options: RibbonOptions): string[] {
  const samples = options.samples ?? 28;
  if (!Number.isInteger(options.lines) || options.lines < 1 || options.lines > MAX_LINES) {
    throw new RangeError(`lines must be an integer from 1 to ${MAX_LINES}, received ${options.lines}`);
  }
  if (!Number.isInteger(samples) || samples < 4) {
    throw new RangeError(`samples must be an integer of at least 4, received ${samples}`);
  }
  if (!(options.width > 0) || !(options.height > 0) || !(options.spacing > 0) || !(options.amplitude >= 0)) {
    throw new RangeError("width, height and spacing must be positive, and amplitude may not be negative");
  }
  if (!Number.isFinite(options.seed)) {
    throw new RangeError("seed must be a finite number");
  }

  const random = createRandom(options.seed);
  const waves = RIBBON_HARMONICS.map((frequency) => ({
    frequency,
    amplitude: (options.amplitude / RIBBON_HARMONICS.length) * (0.5 + 0.5 * random()),
    phase: random() * Math.PI * 2,
  }));

  const paths: string[] = [];
  for (let line = 0; line < options.lines; line += 1) {
    // Each line leans a little further than the one before it, so the band opens out as it falls.
    const lean = 1 + line * 0.06;
    const baseX = line * options.spacing;
    const points: Point[] = [];

    const sweep = options.sweep ?? 0;
    for (let sample = 0; sample < samples; sample += 1) {
      const progress = sample / (samples - 1);
      const y = progress * options.height;
      // Ease the sweep so the band leaves and arrives softly instead of running at a constant angle.
      const lead = sweep * (0.5 - Math.cos(progress * Math.PI) / 2);
      const offset = waves.reduce(
        (sum, wave) => sum + wave.amplitude * lean * Math.sin(wave.frequency * progress * Math.PI * 2 + wave.phase + line * 0.22),
        0,
      );
      points.push([baseX + lead + offset, y]);
    }

    paths.push(toSmoothOpenPath(points));
  }

  return paths;
}
