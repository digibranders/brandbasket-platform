import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { CHATBOT_LEADS_PATH, pageRangeLabel, paginationItems } from "@/lib/chatbots-view";

const BUTTON = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-[0.8125rem] transition-colors duration-200";

function pageHref(page: number): string {
  return page === 1 ? CHATBOT_LEADS_PATH : `${CHATBOT_LEADS_PATH}?page=${page}`;
}

/**
 * Previous, the page numbers and Next under the leads, with which leads the page shows. They are plain links to `?page=`, so
 * the page is read on the server, can be bookmarked and works before anything has loaded. Shown only when there is more than
 * one page.
 */
export function LeadPagination({
  page,
  pageCount,
  perPage,
  total,
}: {
  readonly page: number;
  readonly pageCount: number;
  readonly perPage: number;
  readonly total: number;
}): ReactElement | null {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pages of leads" className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="text-sm text-ink-soft">{pageRangeLabel(page, perPage, total)}</p>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={cn(BUTTON, "text-ink hover:bg-sunken")}>
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(BUTTON, "cursor-not-allowed text-ink-soft/50")}>
              Previous
            </span>
          )}
        </li>
        {paginationItems(page, pageCount).map((item) => (
          <li key={item.kind === "page" ? item.page : `gap-${item.after}`}>
            {item.kind === "gap" ? (
              <span aria-hidden="true" className={cn(BUTTON, "text-ink-soft")}>
                ...
              </span>
            ) : item.page === page ? (
              <span aria-current="page" className={cn(BUTTON, "bg-ink font-semibold text-white")}>
                {item.page}
              </span>
            ) : (
              <Link href={pageHref(item.page)} aria-label={`Page ${item.page}`} className={cn(BUTTON, "text-ink hover:bg-sunken")}>
                {item.page}
              </Link>
            )}
          </li>
        ))}
        <li>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className={cn(BUTTON, "text-ink hover:bg-sunken")}>
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(BUTTON, "cursor-not-allowed text-ink-soft/50")}>
              Next
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
