import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import {
  filtersHref,
  SOURCE_FILTER_LABELS,
  SOURCE_FILTERS,
  STATUS_FILTER_LABELS,
  STATUS_FILTERS,
  type Filters,
  type SourceFilter,
  type StatusFilter,
} from "@/lib/enquiries/rules";

const CHIP = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-[0.9375rem] font-medium transition-colors duration-200";

function Chip({ href, current, children }: { readonly href: string; readonly current: boolean; readonly children: ReactNode }): ReactElement {
  return (
    <Link href={href} aria-current={current ? "true" : undefined} className={cn(CHIP, current ? "bg-ink text-white" : "bg-sunken text-ink hover:bg-line")}>
      {children}
    </Link>
  );
}

/** The status and source filters, as links so the choice sits in the address. The Google chip only shows when Google calls exist. */
export function EnquiryFilters({
  filters,
  counts,
  sources,
}: {
  readonly filters: Filters;
  readonly counts: Readonly<Record<StatusFilter, number>>;
  readonly sources: ReadonlySet<SourceFilter>;
}): ReactElement {
  return (
    <div className="grid gap-3">
      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => (
          <Chip key={status} href={filtersHref({ ...filters, status })} current={filters.status === status}>
            {STATUS_FILTER_LABELS[status]}
            <span className="font-figure tabular-nums">{counts[status]}</span>
          </Chip>
        ))}
      </nav>
      <nav aria-label="Source" className="flex flex-wrap gap-2">
        {SOURCE_FILTERS.filter((source) => source === "all" || source === "website" || source === "ads" || sources.has(source)).map((source) => (
          <Chip key={source} href={filtersHref({ ...filters, source })} current={filters.source === source}>
            {SOURCE_FILTER_LABELS[source]}
          </Chip>
        ))}
      </nav>
    </div>
  );
}
