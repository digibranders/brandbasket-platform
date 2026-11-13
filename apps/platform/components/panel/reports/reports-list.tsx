import { Tray } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT } from "@/components/v2/classes";
import { EmptyState, PageFrame } from "@/components/v2/page";
import { formatSentDate, highlightsOf, reportPath, type ReportMonth } from "@/lib/reports/rules";

/** The Reports list: one row for every month that has a sent report. A month without one is not listed. */
export function ReportsList({ months }: { readonly months: readonly ReportMonth[] }): ReactElement {
  return (
    <PageFrame title="Reports" lede="One report a month: what we did and what it brought you.">
      {months.length === 0 ? (
        <EmptyState icon={Tray} title="No report has been sent yet" text="Your first one appears here after your first full month." />
      ) : (
        <ul className={cn(LIFT, "divide-y divide-line")}>
          {months.map((month) => {
            const highlights = highlightsOf(month);
            return (
              <li key={month.key}>
                <Link
                  href={reportPath(month.key)}
                  className="grid gap-1 px-5 py-4 transition-colors duration-200 hover:bg-sunken sm:grid-cols-[10rem_minmax(0,1fr)_7.5rem] sm:items-baseline sm:gap-6"
                >
                  <span className="font-display text-base font-semibold text-ink">{month.title}</span>
                  <span className="min-w-0 text-[0.9375rem] leading-relaxed text-ink-2">{highlights ?? ""}</span>
                  <span className="font-figure text-[0.9375rem] tabular-nums text-ink-3 sm:text-right">{formatSentDate(month.sentAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageFrame>
  );
}
