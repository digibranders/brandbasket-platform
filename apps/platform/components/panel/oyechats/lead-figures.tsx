import type { ReactElement } from "react";

/** How many leads the assistant has caught in all, this week and this month: three figures in a row, split by hairlines, no boxes. */
export function LeadFigures({ total, lastWeek, lastMonth }: { readonly total: number; readonly lastWeek: number; readonly lastMonth: number }): ReactElement {
  const figures = [
    { label: "Leads in all", value: total },
    { label: "Last 7 days", value: lastWeek },
    { label: "Last 30 days", value: lastMonth },
  ];
  return (
    <dl className="grid grid-cols-3 divide-x divide-line">
      {figures.map((figure) => (
        <div key={figure.label} className="px-4 first:pl-0 sm:px-6">
          <dt className="text-[0.8125rem] text-ink-2">{figure.label}</dt>
          <dd className="mt-1 font-figure text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}
