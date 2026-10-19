import Link from "next/link";
import type { ReactElement } from "react";
import type { PatientFilter } from "@brandbasket/db";
import { cn } from "@brandbasket/shared/lib/cn";
import { pageItems, patientsHref } from "@/app/app-host/(protected)/patients/view";

interface PatientsPaginationProps {
  readonly page: number;
  readonly pages: number;
  readonly filter: PatientFilter;
  readonly search: string;
}

const PAGE_LINK = "inline-flex min-w-9 items-center justify-center rounded-full px-3 py-1.5 text-sm tabular-nums transition-colors duration-300 ease-calm";

/**
 * Previous · 1 … 4 5 6 … 12 · Next under the patient list. Plain links (server-rendered, no client JS), each keeping
 * the filter and search in force, so paging never loses what the list was narrowed to. Previous and Next are left
 * out rather than disabled at either end, the same way the appointments views only offer moves that go somewhere.
 * Rendered only when there is more than one page.
 */
export function PatientsPagination({ page, pages, filter, search }: PatientsPaginationProps): ReactElement {
  return (
    <nav aria-label="Pages" className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
      <div className="min-w-20">
        {page > 1 ? (
          <Link href={patientsHref(filter, search, page - 1)} rel="prev" className="link-underline text-sm text-ink">
            Previous
          </Link>
        ) : null}
      </div>

      <ol className="flex flex-wrap items-center gap-1">
        {pageItems(page, pages).map((item) =>
          item.kind === "gap" ? (
            <li key={item.key} aria-hidden="true" className="px-1 text-sm text-ink-soft">
              …
            </li>
          ) : (
            <li key={item.page}>
              <Link
                href={patientsHref(filter, search, item.page)}
                aria-current={item.page === page ? "page" : undefined}
                aria-label={`Page ${String(item.page)}`}
                className={cn(PAGE_LINK, item.page === page ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink")}
              >
                {item.page}
              </Link>
            </li>
          ),
        )}
      </ol>

      <div className="min-w-20 text-right">
        {page < pages ? (
          <Link href={patientsHref(filter, search, page + 1)} rel="next" className="link-underline text-sm text-ink">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
