import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { SERVICE_DOT } from "@/components/v2/classes";
import type { ResultLine as ResultLineData } from "@/lib/overview";

/** One measured figure for the month: a service-coloured bar, the number, what it counts, and a quieter line under it. */
export function ResultLine({ line }: { readonly line: ResultLineData }): ReactElement {
  return (
    <li className="grid grid-cols-[4px_auto_minmax(0,1fr)] items-center gap-4 border-b border-line py-4 last:border-b-0">
      <span aria-hidden="true" className={cn("h-10 w-1 rounded-full", SERVICE_DOT[line.service])} />
      <span className="min-w-[3.5rem] font-figure text-[1.875rem] font-semibold leading-none tabular-nums text-ink">{line.figure}</span>
      <span className="min-w-0">
        <span className="block text-[0.84375rem] font-semibold text-ink">{line.headline}</span>
        {line.detail === null ? null : <span className="mt-0.5 block text-xs text-ink-2">{line.detail}</span>}
      </span>
    </li>
  );
}
