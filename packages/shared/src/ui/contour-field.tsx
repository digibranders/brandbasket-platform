import type { ReactElement } from "react";
import { cn } from "../lib/cn";
import { contourPaths } from "../lib/contours";

interface ContourFieldProps {
  readonly seed: number;
  readonly rings?: number;
  /** Slowly shifts the lines. Disabled automatically for reduced-motion users. */
  readonly drift?: boolean;
  readonly className?: string;
}

/** Decorative topographic lines: one set of nested rings. Stroke colour comes from currentColor. */
export function ContourField({ seed, rings = 14, drift = false, className }: ContourFieldProps): ReactElement {
  const paths = contourPaths({ cx: 340, cy: 290, rings, baseRadius: 18, spacing: 21, wobble: 0.16, seed });

  return (
    <svg
      viewBox="0 0 600 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none", className)}
    >
      <g className={drift ? "drift" : undefined} fill="none" stroke="currentColor" strokeWidth="1">
        {paths.map((d, index) => (
          <path key={index} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
