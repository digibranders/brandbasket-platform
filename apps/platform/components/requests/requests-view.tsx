import { Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { BookCallButton } from "@/components/calls/book-call-button";
import { LIFT, SOFT_BUTTON } from "@/components/v2/classes";
import type { BookCallOptions } from "@/lib/calls/form";
import { ASK_FOR_A_CHANGE_PATH, listHref } from "@/lib/requests/links";
import { splitRows, type RequestFilter, type RequestRow } from "@/lib/requests/rows";
import { RequestList } from "./request-list";

interface RequestsViewProps {
  readonly rows: readonly RequestRow[];
  readonly listed: readonly RequestRow[];
  readonly filter: RequestFilter;
  readonly selectedId: string | null;
  /** The address named a request: on a phone the request is shown instead of the list. */
  readonly explicit: boolean;
  /** "This month: 1 of 2 included edits used." or null. */
  readonly includedLine: string | null;
  /** The open request's pane, already drawn. */
  readonly detail: ReactNode;
  /** What Book a call needs, or null when calls are not offered (the first look, or no booking link). */
  readonly calls?: BookCallOptions | null;
}

/** The Requests page: a list on the left and the open request on the right, one raised surface. One column on a phone. */
export function RequestsView({ rows, listed, filter, selectedId, explicit, includedLine, detail, calls = null }: RequestsViewProps): ReactElement {
  const counts = splitRows(rows);
  return (
    <div className="mx-auto grid w-full max-w-[68rem] gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Requests</h1>
          <p className="mt-2 text-[0.84375rem] text-ink-2">Ask for any change and follow it here.{includedLine === null ? "" : ` ${includedLine}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {calls === null ? null : <BookCallButton {...calls} />}
          <Link href={ASK_FOR_A_CHANGE_PATH} className={SOFT_BUTTON}>
            <Plus size={16} aria-hidden="true" />
            Ask for a change
          </Link>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-2">No requests yet. Ask for a change and you can follow it here.</p>
      ) : (
        <div className={cn(LIFT, "grid min-h-[34rem] overflow-hidden lg:grid-cols-[20.5rem_minmax(0,1fr)]")}>
          <div className={cn("lg:block", explicit ? "hidden" : "block")}>
            <RequestList rows={listed} filter={filter} selectedId={selectedId} counts={{ open: counts.open.length, done: counts.done.length }} />
          </div>
          <div className={cn("min-w-0 lg:block", explicit ? "block" : "hidden")}>
            {explicit ? (
              <Link href={listHref(filter)} className="block px-5 pt-4 text-[0.8125rem] font-semibold text-ink underline underline-offset-[3px] lg:hidden">
                All requests
              </Link>
            ) : null}
            {detail}
          </div>
        </div>
      )}
    </div>
  );
}
