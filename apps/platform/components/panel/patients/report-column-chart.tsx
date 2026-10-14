import type { CSSProperties, ReactElement } from "react";
import { cn } from "@fynix/shared/lib/cn";

/*
 * The Reports page's column chart: one or two series of counts over a row of categories (months, weekdays, hours).
 * Inline SVG, no chart library, no client JS. The plot is a fixed-height SVG whose bars are placed in percentages
 * of its width, so it fills any container without scaling its rounded bar ends or its text; the axis labels are
 * plain HTML in a grid with the same number of equal columns underneath, so they stay readable at phone width.
 *
 * Accessibility: the SVG is one `role="img"` with the caller's one-line summary as its label, and the full numbers
 * are in a visually hidden table right after it. Each column also carries a <title>, the browser's own tooltip,
 * on a transparent full-height target so hovering anywhere in the column shows its values.
 */

/** Which of the two series colours a series uses: first is the burgundy accent, second the gold. */
export type ReportSeriesTone = "primary" | "secondary";

const FILL_CLASS: Readonly<Record<ReportSeriesTone, string>> = {
  primary: "fill-accent",
  secondary: "fill-gold-deep",
};

const SWATCH_CLASS: Readonly<Record<ReportSeriesTone, string>> = {
  primary: "bg-accent",
  secondary: "bg-gold-deep",
};

export interface ReportSeries {
  readonly label: string;
  readonly tone: ReportSeriesTone;
}

export interface ReportColumn {
  readonly key: string;
  /** Under the column: short ("Mon", "Sep", "09"); empty to leave a crowded axis sparser. */
  readonly axisLabel: string;
  /** In the tooltip and the hidden table ("Monday", "September 2026", "09:00"). */
  readonly fullLabel: string;
  /** One count per series, in the order of `series`. */
  readonly values: readonly number[];
}

interface ReportColumnChartProps {
  /** One sentence naming what is plotted and its high point; the SVG's accessible name. */
  readonly summary: string;
  /** The hidden table's caption. */
  readonly caption: string;
  /** The hidden table's first column heading ("Month", "Day", "Hour"). */
  readonly categoryHeading: string;
  readonly series: readonly ReportSeries[];
  readonly columns: readonly ReportColumn[];
  /** Widest a column may get, in px: keeps a 7-bar chart from stretching its bars across a wide screen. */
  readonly maxColumnWidth: number;
  /** Print each column's count under its label (sensible for a handful of single-series columns only). */
  readonly showValues?: boolean;
}

/** Height of the plot area in px; the tallest bar reaches PLOT_TOP. */
const PLOT_HEIGHT = 128;
const PLOT_TOP = 8;
/** Radius of a bar's rounded data end. */
const BAR_RADIUS = 3;
/** Share of a column one bar takes: a single series, or each of a pair. */
const SINGLE_BAR_SHARE = 0.44;
const PAIRED_BAR_SHARE = 0.3;
/** Share of a column between the two bars of a pair: the surface gap that keeps them apart. */
const PAIR_GAP_SHARE = 0.04;

function percent(value: number): string {
  return `${String(Math.round(value * 1000) / 1000)}%`;
}

interface BarProps {
  /** Left edge and width, as percentages of the plot's width. */
  readonly x: number;
  readonly width: number;
  readonly value: number;
  readonly max: number;
  readonly tone: ReportSeriesTone;
}

/** A bar with a rounded top and a square foot: a rounded rect, with a square rect over its bottom radius. */
function Bar({ x, width, value, max, tone }: BarProps): ReactElement | null {
  if (value <= 0 || max <= 0) return null;
  const height = Math.max(((PLOT_HEIGHT - PLOT_TOP) * value) / max, 2);
  const y = PLOT_HEIGHT - height;
  const foot = Math.min(height, BAR_RADIUS);
  return (
    <g className={FILL_CLASS[tone]}>
      <rect x={percent(x)} y={y} width={percent(width)} height={height} rx={BAR_RADIUS} />
      <rect x={percent(x)} y={PLOT_HEIGHT - foot} width={percent(width)} height={foot} />
    </g>
  );
}

function tooltip(column: ReportColumn, series: readonly ReportSeries[]): string {
  const parts = series.map((entry, index) => `${entry.label} ${String(column.values[index] ?? 0)}`);
  return `${column.fullLabel}: ${parts.join(", ")}`;
}

export function ReportLegend({ series }: { readonly series: readonly ReportSeries[] }): ReactElement {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
      {series.map((entry) => (
        <li key={entry.label} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("size-2.5 rounded-sm", SWATCH_CLASS[entry.tone])} />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

export function ReportColumnChart({
  summary,
  caption,
  categoryHeading,
  series,
  columns,
  maxColumnWidth,
  showValues = false,
}: ReportColumnChartProps): ReactElement {
  const count = columns.length;
  const max = Math.max(0, ...columns.flatMap((column) => column.values));
  const slot = 100 / Math.max(count, 1);
  const paired = series.length === 2;
  const barWidth = slot * (paired ? PAIRED_BAR_SHARE : SINGLE_BAR_SHARE);
  const groupWidth = paired ? barWidth * 2 + slot * PAIR_GAP_SHARE : barWidth;
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${String(count)}, minmax(0, 1fr))` };

  return (
    <div>
      {paired ? (
        <div className="mb-4">
          <ReportLegend series={series} />
        </div>
      ) : null}
      <div style={{ maxWidth: count * maxColumnWidth }}>
        <svg role="img" aria-label={summary} width="100%" height={PLOT_HEIGHT} className="block overflow-visible">
          <line x1="0" x2="100%" y1={PLOT_HEIGHT - 0.5} y2={PLOT_HEIGHT - 0.5} className="stroke-line" strokeWidth={1} />
          {columns.map((column, index) => {
            const groupX = slot * index + (slot - groupWidth) / 2;
            return (
              <g key={column.key}>
                {series.map((entry, seriesIndex) => (
                  <Bar
                    key={entry.label}
                    x={groupX + seriesIndex * (barWidth + slot * PAIR_GAP_SHARE)}
                    width={barWidth}
                    value={column.values[seriesIndex] ?? 0}
                    max={max}
                    tone={entry.tone}
                  />
                ))}
                <rect x={percent(slot * index)} y={0} width={percent(slot)} height={PLOT_HEIGHT} fill="transparent">
                  <title>{tooltip(column, series)}</title>
                </rect>
              </g>
            );
          })}
        </svg>
        <div aria-hidden="true" className="mt-2 grid text-center text-xs text-ink-soft" style={grid}>
          {columns.map((column) => (
            <div key={column.key} className="min-w-0">
              <div className="truncate">{column.axisLabel}</div>
              {showValues ? <div className="mt-0.5 font-medium text-ink tabular-nums">{column.values[0] ?? 0}</div> : null}
            </div>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{categoryHeading}</th>
            {series.map((entry) => (
              <th key={entry.label} scope="col">
                {entry.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={column.key}>
              <th scope="row">{column.fullLabel}</th>
              {series.map((entry, index) => (
                <td key={entry.label}>{column.values[index] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
