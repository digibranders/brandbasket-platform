import { ChatCircleDots, Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { BookCallButton } from "@/components/calls/book-call-button";
import { DARK_BUTTON, LIFT, SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageFrame } from "@/components/v2/page";
import type { BookCallOptions } from "@/lib/calls/form";
import { ASK_FOR_A_CHANGE_PATH, listHref } from "@/lib/requests/links";
import { splitRows, type RequestFilter, type RequestRow } from "@/lib/requests/rows";
import { EMPTY_LINES, RequestList } from "./request-list";

interface RequestsViewProps {
  readonly rows: readonly RequestRow[];
  readonly listed: readonly RequestRow[];
  readonly filter: RequestFilter;
  readonly selectedId: string | null;
  /** The address named a request: on a phone the request is shown instead of the list. */
  readonly explicit: boolean;
  /** The open request's pane, already drawn. */
  readonly detail: ReactNode;
  /** What Book a call needs, or null when calls are not offered (the first look, or no booking link). */
  readonly calls?: BookCallOptions | null;
}

/** The Requests page: a list on the left and the open request on the right, one raised surface. One pane at a time while the page is narrow. */
export function RequestsView({ rows, listed, filter, selectedId, explicit, detail, calls = null }: RequestsViewProps): ReactElement {
  const counts = splitRows(rows);
  return (
    <PageFrame
      title="Requests"
      lede="Everything you have asked us, and anything we have asked you."
      action={
        <>
          {calls === null ? null : <BookCallButton {...calls} />}
          <Link href={ASK_FOR_A_CHANGE_PATH} className={SOFT_BUTTON}>
            <Plus size={16} aria-hidden="true" />
            New request
          </Link>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={ChatCircleDots}
          title="No requests yet"
          text="Ask a question, send us information or ask for a change. Follow it here, from our first reply to the day it is done."
          action={
            <Link href={ASK_FOR_A_CHANGE_PATH} className={DARK_BUTTON}>
              New request
            </Link>
          }
        />
      ) : (
        <div className={cn(LIFT, "grid min-h-[34rem] overflow-hidden @2xl:min-h-[40rem] @2xl:grid-cols-[20.5rem_minmax(0,1fr)]")}>
          <div className={cn("border-line @2xl:block @2xl:border-r", explicit ? "hidden" : "block")}>
            <RequestList rows={listed} filter={filter} selectedId={selectedId} counts={{ waiting: counts.waiting.length, open: counts.open.length, done: counts.done.length }} />
          </div>
          <div className={cn("min-w-0 @2xl:block", explicit ? "block" : "hidden")}>
            {explicit ? (
              <Link href={listHref(filter)} className="block px-5 pt-4 text-[0.8125rem] font-semibold text-ink underline underline-offset-[3px] @2xl:hidden">
                All requests
              </Link>
            ) : null}
            {detail ?? (
              <div className="grid h-full place-items-center p-10">
                <EmptyState compact icon={ChatCircleDots} title={EMPTY_LINES[filter]} text="A new request appears here as soon as you send it." />
              </div>
            )}
          </div>
        </div>
      )}
    </PageFrame>
  );
}
