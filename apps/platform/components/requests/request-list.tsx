import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { listHref, listRowHref } from "@/lib/requests/links";
import type { PillTone, RequestFilter, RequestRow } from "@/lib/requests/rows";

const PILL: Readonly<Record<PillTone, string>> = {
  waiting: "bg-rattan-wash text-rattan-ink",
  progress: "bg-c-search/10 text-c-search",
  done: "bg-sage-wash text-sage-deep",
  closed: "bg-sunken text-ink-2",
};

interface RequestListProps {
  readonly rows: readonly RequestRow[];
  readonly filter: RequestFilter;
  readonly selectedId: string | null;
  readonly counts: { readonly open: number; readonly done: number };
}

/** The list on the left: Open and Done above, then a row for each request with its title, its status word and its kind and date. */
export function RequestList({ rows, filter, selectedId, counts }: RequestListProps): ReactElement {
  return (
    <div>
      <nav aria-label="Show requests" className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2.5">
        {(["open", "done"] as const).map((value) => (
          <Link
            key={value}
            href={listHref(value)}
            aria-current={filter === value ? "true" : undefined}
            className={cn("rounded-[0.4375rem] px-2.5 py-1 text-[0.78125rem] font-semibold transition-colors duration-200", filter === value ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken")}
          >
            {value === "open" ? "Open" : "Done"} <span className="font-figure tabular-nums">{counts[value]}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="px-3.5 py-4 text-[0.84375rem] text-ink-2 @2xl:hidden">{filter === "open" ? "Nothing is open." : "Nothing is done yet."}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.ticketId} className="border-t border-line first:border-t-0">
              <Link
                href={listRowHref(row.ticketId, filter)}
                aria-current={row.ticketId === selectedId ? "page" : undefined}
                className={cn("grid gap-1 px-3.5 py-3 transition-colors duration-200", row.ticketId === selectedId ? "bg-bg shadow-[inset_3px_0_0_0_var(--color-ink)]" : "hover:bg-bg")}
              >
                <span className="flex items-center justify-between gap-2">
                  <b className="min-w-0 break-words text-[0.84375rem] font-semibold text-ink">{row.title}</b>
                  <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold", PILL[row.tone])}>{row.word}</span>
                </span>
                <small className="text-xs text-ink-2">
                  {row.sub}
                  {row.unread ? <span className="ml-2 font-semibold text-ink">New reply</span> : null}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
