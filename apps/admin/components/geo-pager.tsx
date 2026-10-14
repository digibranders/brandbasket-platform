import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@firstfold/shared/lib/cn";
import { geographyHref, type GeographyView } from "@/lib/geography-view";

interface GeoPagerProps {
  readonly view: GeographyView;
  /** The district an Areas list is for; carried so paging stays inside it. */
  readonly district?: string;
  readonly page: number;
  readonly pageCount: number;
}

/** The page numbers to show: the first, the last and a window around the current one, with gaps as null. */
function pageNumbers(page: number, pageCount: number): readonly (number | null)[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const numbers = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  return numbers.flatMap((n, index) => (index > 0 && n - numbers[index - 1]! > 1 ? [null, n] : [n]));
}

/** Previous, numbered pages and next, under a list. Nothing renders when everything fits on one page. */
export function GeoPager({ view, district = "", page, pageCount }: GeoPagerProps): ReactElement | null {
  if (pageCount <= 1) return null;
  const hrefFor = (target: number): string => geographyHref({ ...view, district, page: target });
  const step = "rounded-full px-3 py-1.5 text-sm tabular-nums transition-colors duration-300 ease-calm";
  return (
    <nav aria-label="Pages" className="flex items-center gap-4">
      <p className="hidden text-sm text-ink-soft tabular-nums md:block">
        Page {page} of {pageCount}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={cn(step, "text-ink-soft hover:bg-ink/5 hover:text-ink")} rel="prev">
            Previous
          </Link>
        ) : null}
        {pageNumbers(page, pageCount).map((number, index) =>
          number === null ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-ink-soft">
              …
            </span>
          ) : (
            <Link
              key={number}
              href={hrefFor(number)}
              aria-current={number === page ? "page" : undefined}
              className={cn(step, number === page ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink")}
            >
              {number}
            </Link>
          ),
        )}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className={cn(step, "text-ink-soft hover:bg-ink/5 hover:text-ink")} rel="next">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
