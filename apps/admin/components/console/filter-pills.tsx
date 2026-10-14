import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@fynix/shared/lib/cn";
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

/** A row of links that narrow a list. Counts ride along quietly so the filter doubles as the summary. */
export function FilterPills({ label, options }: FilterPillsProps): ReactElement {
  return (
    <FilterPillsRow label={label}>
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.current ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors duration-300 ease-calm",
            option.current ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink",
          )}
        >
          {option.label}
          {option.count === undefined ? null : (
            <span className={cn("tabular-nums", option.current ? "text-paper/60" : "text-ink-soft/80")}>
              {option.count}
            </span>
          )}
        </Link>
      ))}
    </FilterPillsRow>
  );
}
