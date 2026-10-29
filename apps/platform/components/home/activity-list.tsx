import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { SERVICE_DOT } from "@/components/v2/classes";
import { dayMonth } from "@/lib/call-dates";
import type { ActivityRow } from "@/lib/overview";

/** What BrandBasket has done, dated, newest first: only lines that something stored (a staff update, the preview, the launch). */
export function ActivityList({ rows, title }: { readonly rows: readonly ActivityRow[]; readonly title: string }): ReactElement {
  return (
    <section aria-labelledby="home-activity" className="rounded-lift bg-surface shadow-lift">
      <h2 id="home-activity" className="border-b border-line px-5 py-4 font-display text-lg font-semibold text-ink">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-[0.9375rem] text-ink-2">Nothing has been recorded yet. Each thing we do appears here, with its date.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 px-5 py-3.5">
              <span className="text-[0.8125rem] text-ink-3">{dayMonth(row.at)}</span>
              <span className="flex items-start gap-2.5 text-[0.9375rem] font-semibold text-ink">
                {row.service === null ? null : <span aria-hidden="true" className={cn("mt-[0.45rem] size-2 shrink-0 rounded-[2px]", SERVICE_DOT[row.service])} />}
                {row.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
