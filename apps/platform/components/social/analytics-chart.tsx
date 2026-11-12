import type { ReactElement } from "react";
import { dayLabel } from "@/lib/social/auto";

export interface ChartLine {
  readonly key: string;
  readonly label: string;
  /** The line's colour: the network's own, as a CSS value. */
  readonly color: string;
  /** One value for each day; a day with no reading is null and leaves a gap in the line. */
  readonly data: ReadonlyArray<number | null>;
}

const W = 720;
const H = 220;
const LEFT = 40;
const RIGHT = 8;
const TOP = 10;
const BOTTOM = 24;

const niceTop = (max: number): number => {
  if (max <= 0) return 10;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
};

/** The line as separate strokes, one for each run of days that have a reading, so a missing day is a gap. */
function pathOf(data: ReadonlyArray<number | null>, x: (index: number) => number, y: (value: number) => number): string {
  let path = "";
  let open = false;
  data.forEach((value, index) => {
    if (value === null) {
      open = false;
      return;
    }
    path += `${open ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)} `;
    open = true;
  });
  return path.trim();
}

/**
 * A line for each network over the days given, drawn on one scale with a faint grid and the first, middle and last day named. It is
 * drawn on the server, so it needs no script. The numbers it plots are the ones the page shows beside it.
 */
export function AnalyticsChart({ lines, days, label }: { readonly lines: readonly ChartLine[]; readonly days: readonly string[]; readonly label: string }): ReactElement {
  const top = niceTop(Math.max(0, ...lines.flatMap((line) => line.data.filter((value): value is number => value !== null))));
  const x = (index: number): number => LEFT + ((W - LEFT - RIGHT) * (days.length > 1 ? index / (days.length - 1) : 0));
  const y = (value: number): number => TOP + (H - TOP - BOTTOM) * (1 - value / top);
  const ticks = [0, 1, 2, 3, 4].map((step) => (top * step) / 4);
  const named = [0, Math.floor((days.length - 1) / 2), days.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} className="stroke-line" strokeWidth={1} />
          <text x={LEFT - 6} y={y(tick) + 3} textAnchor="end" className="fill-ink-3 text-[10px]">
            {new Intl.NumberFormat("en-IN").format(Math.round(tick))}
          </text>
        </g>
      ))}
      {lines.map((line) => (
        <g key={line.key}>
          <path fill="none" stroke={line.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" d={pathOf(line.data, x, y)} />
          {line.data.map((value, index) => (value !== null && line.data[index - 1] == null && line.data[index + 1] == null ? <circle key={index} cx={x(index)} cy={y(value)} r={2.6} fill={line.color} /> : null))}
        </g>
      ))}
      {named.map((index, position) => {
        const day = days[index];
        return day === undefined ? null : (
          <text key={`${index}:${day}`} x={x(index)} y={H - 6} textAnchor={position === 0 ? "start" : position === 2 ? "end" : "middle"} className="fill-ink-3 text-[10px]">
            {dayLabel(day, { day: "numeric", month: "short" })}
          </text>
        );
      })}
    </svg>
  );
}
