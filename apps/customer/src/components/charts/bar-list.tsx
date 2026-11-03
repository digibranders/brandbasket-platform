import { barShare, formatChartValue, type ChartFormat } from "./scale";

export interface BarListItem {
  /** Written for reading: "Google search", "/tests/thyroid". */
  readonly label: string;
  readonly value: number;
}

export interface BarListProps {
  /** What the list ranks, for screen readers: "Visits by source, last 30 days". */
  readonly label: string;
  /** Biggest first, as the caller decides the order. */
  readonly items: readonly BarListItem[];
  readonly format?: ChartFormat;
}

/** Labelled bars measured against the longest one, each with its number as text (plan 60, section 11). */
export function BarList({ label, items, format = "number" }: BarListProps) {
  const longest = Math.max(0, ...items.map((item) => item.value));
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3 type-meta text-ink-2">
          <span className="w-28 shrink-0 truncate" title={item.label}>
            {item.label}
          </span>
          <span aria-hidden className="h-3.5 flex-1">
            <span className="block h-full rounded-mark bg-c1" style={{ width: `${barShare(item.value, longest)}%` }} />
          </span>
          <span className="w-14 shrink-0 text-right font-medium text-ink">{formatChartValue(item.value, format)}</span>
        </li>
      ))}
    </ul>
  );
}
