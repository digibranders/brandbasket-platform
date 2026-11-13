import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT } from "@/components/v2/classes";
import type { VisitsData } from "@/lib/server/site-visits";
import { formatChange, formatNumber } from "@/lib/website/format";
import { listPeriod, periodLine, updatedLine, type RankedRow } from "@/lib/website/visits";

function Ranked({ title, rows, mono }: { readonly title: string; readonly rows: readonly RankedRow[]; readonly mono: boolean }): ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-2">
      <h3 className="text-[0.9375rem] font-semibold text-ink">{title}</h3>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <span className={cn("min-w-0 break-words text-[0.9375rem] text-ink", mono && "font-figure")}>{row.label}</span>
            <span className="font-figure text-[0.9375rem] tabular-nums text-ink-2">{formatNumber(row.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Website visits: the 30 days' total against the 30 before, then the month's most visited pages and where visitors came from. */
export function VisitsCard({ visits, now }: { readonly visits: VisitsData; readonly now: Date }): ReactElement {
  const { summary, lists } = visits;
  return (
    <section aria-labelledby="visits-title" className={cn(LIFT, "grid content-start gap-5 p-5 md:p-6")}>
      <div className="grid gap-1">
        <h2 id="visits-title" className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
          Visits to your website
        </h2>
        <p className="text-[0.9375rem] text-ink-2">{periodLine(summary)}</p>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-figure text-3xl font-semibold tabular-nums text-ink">{formatNumber(summary.total)}</span>
        {summary.change === null ? null : (
          <span className="text-[0.9375rem] text-ink-2">
            <span className="font-figure tabular-nums">{formatChange(summary.change)}</span> on the 30 days before
          </span>
        )}
      </p>
      {lists === null ? null : (
        <>
          <p className="text-[0.8125rem] text-ink-3">
            {listPeriod(lists.month, now)}. {updatedLine(lists.updatedAt, summary.source, now)}
          </p>
          <Ranked title="Most visited pages" rows={lists.pages} mono />
          <Ranked title="Where visitors come from" rows={lists.channels} mono={false} />
        </>
      )}
    </section>
  );
}
