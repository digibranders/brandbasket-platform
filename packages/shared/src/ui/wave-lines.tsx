import type { ReactElement } from "react";
import { cn } from "../lib/cn";
import { ribbonPaths } from "../lib/contours";

const VIEW_WIDTH = 420;
const VIEW_HEIGHT = 900;

interface WaveLinesProps {
  readonly seed: number;
  readonly lines?: number;
  /** Gap between neighbouring lines, in view-box units; wider reads lighter. */
  readonly spacing?: number;
  /** Mirrored, for the opposite edge of a section. */
  readonly flipped?: boolean;
  readonly className?: string;
}

/**
 * Decorative contour ribbons running down one edge of a dark section. Stroke colour comes from currentColor,
 * and the paths are deterministic for a given seed so server and client renders match.
 */
export function WaveLines({ seed, lines = 10, spacing = 20, flipped = false, className }: WaveLinesProps): ReactElement {
  const paths = ribbonPaths({
    lines,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    spacing,
    amplitude: 52,
    sweep: 150,
    seed,
  });

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMinYMid slice"
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none", flipped ? "-scale-x-100" : null, className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1">
        {paths.map((d, index) => (
          <path key={index} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
