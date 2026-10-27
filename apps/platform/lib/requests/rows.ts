import type { RequestListItem } from "@brandbasket/db";
import { CLOSED_LABEL, customerStatus, ticketStatusWord, type CustomerStatus } from "@brandbasket/shared/lib/change-requests";
import { dayMonth } from "@/lib/call-dates";
import { KIND_LABELS } from "./form";

/** How a status looks in the list: `waiting` is the customer's turn, `progress` is ours, `done` and `closed` are over. */
export type PillTone = "waiting" | "progress" | "done" | "closed";

export interface RequestRow {
  readonly ticketId: string;
  readonly title: string;
  readonly word: CustomerStatus | typeof CLOSED_LABEL;
  readonly tone: PillTone;
  /** "Website · 27 Nov". */
  readonly sub: string;
  /** The team replied and it has not been read. */
  readonly unread: boolean;
  /** Still going: not Done and not Closed. */
  readonly open: boolean;
}

function toneOf(word: CustomerStatus | typeof CLOSED_LABEL): PillTone {
  if (word === "Quoted" || word === "Ready to check") return "waiting";
  if (word === "Done") return "done";
  if (word === CLOSED_LABEL) return "closed";
  return "progress";
}

/** The Requests list's rows, in the order given (newest activity first). A question wears the same five words. */
export function requestRows(items: readonly RequestListItem[]): readonly RequestRow[] {
  return items.map((item): RequestRow => {
    const word = item.change === null ? ticketStatusWord(item.ticketStatus) : customerStatus(item.change.state);
    const kind = item.change === null ? "Question" : KIND_LABELS[item.change.kind];
    return {
      ticketId: item.ticketId,
      title: item.subject,
      word,
      tone: toneOf(word),
      sub: `${kind} · ${dayMonth(item.createdAt)}`,
      unread: item.unread,
      open: word !== "Done" && word !== CLOSED_LABEL,
    };
  });
}

export interface RequestFilters {
  readonly open: readonly RequestRow[];
  readonly done: readonly RequestRow[];
}

/** The two filters above the list, "Open 3" and "Done 11": a closed request is filed with Done. */
export function splitRows(rows: readonly RequestRow[]): RequestFilters {
  return { open: rows.filter((row) => row.open), done: rows.filter((row) => !row.open) };
}

export type RequestFilter = "open" | "done";

export interface ViewChoice {
  readonly filter: RequestFilter;
  /** The rows the list shows. */
  readonly listed: readonly RequestRow[];
  /** The request in the right-hand pane: the one asked for, else the first in the list. Null when there is none. */
  readonly selectedId: string | null;
  /** The address named a request. On a phone that shows the request instead of the list. */
  readonly explicit: boolean;
}

/**
 * Works out what the Requests page shows from its address: `?filter=open|done` and `?open=<ticket>`. A request asked for by
 * address decides the filter when none is given, so the row you opened is in the list you see.
 */
export function chooseView(rows: readonly RequestRow[], params: { readonly filter?: string | undefined; readonly open?: string | undefined }): ViewChoice {
  const asked = params.open === undefined ? undefined : rows.find((row) => row.ticketId === params.open);
  const filter: RequestFilter = params.filter === "done" ? "done" : params.filter === "open" ? "open" : asked !== undefined && !asked.open ? "done" : "open";
  const { open, done } = splitRows(rows);
  const listed = filter === "done" ? done : open;
  return { filter, listed, selectedId: params.open ?? listed[0]?.ticketId ?? null, explicit: params.open !== undefined };
}

/** "This month: 1 of 2 included edits used." Null when the plan has no included edits, so the line is left out. */
export function includedHeaderLine(used: number, allowed: number): string | null {
  return allowed === 0 ? null : `This month: ${used} of ${allowed} included edits used.`;
}
