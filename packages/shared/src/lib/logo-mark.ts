import { toSmoothClosedPath } from "./contours";

/**
 * The Firstfold mark: nested rings with five soft lobes, like contour lines around a summit.
 * The geometry is generated so the header logo, favicon and app icon always match.
 */

export interface LogoMarkOptions {
  /** Number of rings, from the innermost outwards. */
  readonly rings: number;
  /** Width and height of the square viewBox the rings are drawn in. */
  readonly size: number;
}

const MAX_RINGS = 8;
const SAMPLES_PER_RING = 40;
const LOBES = 5;
/** Innermost ring radius as a share of the outermost ring radius. */
const INNER_RADIUS_RATIO = 0.21;
/** Inner rings read as a soft pentagon; outer rings relax towards a circle. */
const INNER_LOBE_DEPTH = 0.13;
const OUTER_LOBE_DEPTH = 0.075;
/** A faint second harmonic keeps the rings from looking machine-perfect. */
const DRIFT_DEPTH = 0.012;
const DRIFT_PHASE = 0.9;
/** Inner rings sit slightly low, as in the drawn mark. */
const INNER_DROP = 0.03;
/** Space kept clear inside each edge for the stroke, as a share of size. */
const EDGE_PADDING_RATIO = 0.04;

export function createLogoMarkPaths({ rings, size }: LogoMarkOptions): string[] {
  if (!Number.isInteger(rings) || rings < 1 || rings > MAX_RINGS) {
    throw new RangeError(`rings must be an integer from 1 to ${MAX_RINGS}, received ${rings}`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new RangeError(`size must be a positive finite number, received ${size}`);
  }

  const centre = size / 2;
  const outerReach = 1 + OUTER_LOBE_DEPTH + DRIFT_DEPTH;
  const outerRadius = (centre - size * EDGE_PADDING_RATIO) / outerReach;

  return Array.from({ length: rings }, (_, ring) => {
    // 0 for the innermost ring, 1 for the outermost.
    const progress = rings === 1 ? 1 : ring / (rings - 1);
    const radius = outerRadius * (INNER_RADIUS_RATIO + (1 - INNER_RADIUS_RATIO) * progress);
    const lobeDepth = INNER_LOBE_DEPTH + (OUTER_LOBE_DEPTH - INNER_LOBE_DEPTH) * progress;
    const centreY = centre + outerRadius * INNER_DROP * (1 - progress);

    const points = Array.from({ length: SAMPLES_PER_RING }, (_, sample) => {
      // Start at the top so the first lobe points straight up.
      const angle = -Math.PI / 2 + (sample / SAMPLES_PER_RING) * Math.PI * 2;
      const lobe = Math.cos(LOBES * (angle + Math.PI / 2));
      const drift = Math.cos(2 * angle + DRIFT_PHASE);
      const distance = radius * (1 + lobeDepth * lobe + DRIFT_DEPTH * drift);
      return [centre + distance * Math.cos(angle), centreY + distance * Math.sin(angle)] as const;
    });

    return toSmoothClosedPath(points);
  });
}
