import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { FilterPillsRow } from "./filter-pills-row";

export interface FilterOption {
  readonly href: string;
  readonly label: string;
  readonly count?: number;
  readonly current: boolean;
}

interface FilterPillsProps {
  /** Names the filter for screen readers, e.g. "Filter by status". */
  readonly label: string;
  readonly options: readonly FilterOption[];
}

/** A row of soft chips that narrow a list. Counts ride along so the filter doubles as the summary. */
export function FilterPills({ label, options }: FilterPillsProps): ReactElement {
  return (
    <FilterPillsRow label={label}>
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.current ? "page" : undefined}
          className={cn(
            "inline-flex h-[1.875rem] shrink-0 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold transition-colors duration-200",
            option.current ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line hover:text-ink",
          )}
        >
          {option.label}
          {option.count === undefined ? null : (
            <span className={cn("font-figure text-[0.71875rem] tabular-nums", option.current ? "text-white/75" : "text-ink-2")}>{option.count}</span>
          )}
        </Link>
      ))}
    </FilterPillsRow>
  );
}
