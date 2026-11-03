"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { formatChartValue, labelEvery, nearestIndex, round, valueScale, xPositions, type ChartFormat } from "./scale";

/** The width drawn before the chart has been measured (server render). */
const DEFAULT_WIDTH = 640;
/** The least width the geometry is drawn for; narrower boxes scale down from it. */
const MIN_WIDTH = 280;
const LEFT = 44;
const RIGHT = 12;
const TOP = 12;
const BOTTOM_GAP = 28;

export interface LineSeries {
  /** Shown in the legend, the tooltip and the table for screen readers: "This month", "Last month". */
  readonly name: string;
  /** One value per label. */
  readonly values: readonly number[];
}

export interface LineChartProps {
  /** What the chart shows, for screen readers: "Visits by day, last 30 days". */
  readonly label: string;
  /** One label per point, already written for reading: "3 Nov". */
  readonly labels: readonly string[];
  /** The customer's own series, always cobalt (c1) with the area fill. */
  readonly current: LineSeries;
  /** The previous period, dashed grey (c-ref). */
  readonly previous?: LineSeries;
  readonly format?: ChartFormat;
  /** Search positions: 1 at the top, the axis does not start at zero. */
  readonly invert?: boolean;
  /** Start the axis at zero. On by default, off for ranks. */
  readonly zero?: boolean;
  readonly height?: number;
}

const points = (values: readonly number[], xs: readonly number[], y: (value: number) => number) =>
  values.map((value, index) => `${round(xs[index] ?? 0)},${round(y(value))}`).join(" ");

/** The pixel width of an element, kept current. The chart draws at this width so its text stays 12px on a phone. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next = Math.round(element.clientWidth);
      if (next > 0) setWidth(Math.max(MIN_WIDTH, next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * A line chart in plain SVG (plan 60, section 11): the customer's series in c1 with a 7% area fill and an emphasised last
 * point, the previous period dashed in c-ref, dashed gridlines. Hovering or tapping shows the date and values. A table of
 * every value is there for screen readers.
 */
export function LineChart({ label, labels, current, previous, format = "number", invert = false, zero, height = 220 }: LineChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const { ref, width } = useWidth();
  const tableId = useId();
  const count = labels.length;
  if (count === 0 || current.values.length !== count || (previous !== undefined && previous.values.length !== count)) {
    throw new RangeError(`LineChart "${label}" needs one value per label in every series.`);
  }

  const bottom = height - BOTTOM_GAP;
  const scale = valueScale([...current.values, ...(previous?.values ?? [])], { top: TOP, bottom, invert, ...(zero === undefined ? {} : { zero }) });
  const xs = xPositions(count, LEFT, width - RIGHT);
  const every = labelEvery(count);
  const lastX = xs[count - 1] ?? LEFT;
  const lastValue = current.values[count - 1] ?? 0;
  // The fill closes along the bottom of the plot (or the top for ranks, where the baseline is the worst position).
  const base = invert ? scale.y(scale.max) : scale.y(scale.min);
  const area = `${round(xs[0] ?? LEFT)},${round(base)} ${points(current.values, xs, scale.y)} ${round(lastX)},${round(base)}`;

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return;
    setActive(nearestIndex(xs, ((event.clientX - box.left) / box.width) * width));
  };

  const activeX = active === null ? null : (xs[active] ?? null);

  return (
    <figure className="m-0 flex flex-col gap-3">
      {previous === undefined ? null : (
        <div aria-hidden className="flex flex-wrap gap-4 type-meta text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-mark bg-c1" />
            {current.name}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-c-ref" />
            {previous.name}
          </span>
        </div>
      )}
      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label} aria-describedby={tableId} className="block overflow-visible">
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={LEFT} x2={width - RIGHT} y1={round(scale.y(tick))} y2={round(scale.y(tick))} className="stroke-grid" strokeDasharray="2 4" />
              <text x={LEFT - 8} y={round(scale.y(tick)) + 4} textAnchor="end" fontSize={12} className="fill-ink-3">
                {formatChartValue(tick, format)}
              </text>
            </g>
          ))}
          {labels.map((text, index) =>
            index % every === 0 ? (
              <text key={`${index}-${text}`} x={round(xs[index] ?? 0)} y={height - 8} textAnchor="middle" fontSize={12} className="fill-ink-3">
                {text}
              </text>
            ) : null,
          )}
          <polygon points={area} className="fill-c1" fillOpacity={0.07} />
          {previous === undefined ? null : (
            <polyline points={points(previous.values, xs, scale.y)} fill="none" className="stroke-c-ref" strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" />
          )}
          <polyline points={points(current.values, xs, scale.y)} fill="none" className="stroke-c1" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={round(lastX)} cy={round(scale.y(lastValue))} r={4} className="fill-c1 stroke-surface" strokeWidth={2} />
          {activeX === null || active === null ? null : (
            <g>
              <line x1={round(activeX)} x2={round(activeX)} y1={TOP} y2={bottom} className="stroke-border-control" strokeWidth={1} />
              <circle cx={round(activeX)} cy={round(scale.y(current.values[active] ?? 0))} r={3.5} className="fill-c1 stroke-surface" strokeWidth={2} />
            </g>
          )}
          <rect
            x={LEFT}
            y={TOP}
            width={width - LEFT - RIGHT}
            height={bottom - TOP}
            fill="transparent"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {activeX === null || active === null ? null : (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 flex-col gap-0.5 rounded-control border border-border bg-surface px-2.5 py-1.5 whitespace-nowrap shadow-pop"
            style={{ left: `${(activeX / width) * 100}%` }}
          >
            <span className="type-label text-ink-3">{labels[active]}</span>
            <span className="type-label text-ink">
              {current.name}: {formatChartValue(current.values[active] ?? 0, format)}
            </span>
            {previous === undefined ? null : (
              <span className="type-label text-ink-3">
                {previous.name}: {formatChartValue(previous.values[active] ?? 0, format)}
              </span>
            )}
          </div>
        )}
      </div>
      <table id={tableId} className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{current.name}</th>
            {previous === undefined ? null : <th scope="col">{previous.name}</th>}
          </tr>
        </thead>
        <tbody>
          {labels.map((text, index) => (
            <tr key={`${index}-${text}`}>
              <th scope="row">{text}</th>
              <td>{formatChartValue(current.values[index] ?? 0, format)}</td>
              {previous === undefined ? null : <td>{formatChartValue(previous.values[index] ?? 0, format)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
