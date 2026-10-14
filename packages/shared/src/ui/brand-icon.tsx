import { ImageResponse } from "next/og";
import { createLogoMarkPaths } from "../lib/logo-mark";

/** Brand colours for generated PNG icons; keep in sync with --color-dark-surface and --color-paper in src/styles/theme.css. */
const INK = "#500018";
const PAPER = "#f6efe6";

/** Rings are drawn on a 100 × 100 grid, so stroke widths below are in grid units. */
const ICON_GRID_SIZE = 100;

interface BrandIconOptions {
  /** Output width and height in pixels. */
  readonly size: number;
  readonly rings: number;
  /** Stroke width in grid units. */
  readonly strokeWidth: number;
  /** Share of the icon the mark fills; the rest is paper background. */
  readonly markScale: number;
  readonly cornerRadius: number;
}

export function createBrandIconResponse({
  size,
  rings,
  strokeWidth,
  markScale,
  cornerRadius,
}: BrandIconOptions): ImageResponse {
  const markSize = Math.round(size * markScale);
  const paths = createLogoMarkPaths({ rings, size: ICON_GRID_SIZE });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PAPER,
          borderRadius: cornerRadius,
        }}
      >
        <svg
          width={markSize}
          height={markSize}
          viewBox={`0 0 ${ICON_GRID_SIZE} ${ICON_GRID_SIZE}`}
          fill="none"
          stroke={INK}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        >
          {paths.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
