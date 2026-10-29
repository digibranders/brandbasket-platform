import type { RequestListItem } from "@brandbasket/db";
import { CLOSED_LABEL, customerStatus, ticketStatusWord, WAITING_FOR_YOU, type TicketStatusWord } from "@brandbasket/shared/lib/change-requests";
import { dayMonth } from "@/lib/call-dates";
import { KIND_LABELS } from "./form";

/** What a conversation with no change details is called in the list, from the category it was filed under. */
const PLAIN_LABELS: Readonly<Record<RequestListItem["category"], string>> = {
  bug: "Not working",
  support: "Question",
  feature: "Question",
  billing: "Billing",
  website_change: "Website",
  account_access: "Account",
  general: "Information",
  other: "Question",
};

/** How a status looks in the list: `waiting` is the customer's turn, `progress` is ours, `done` and `closed` are over. */
export type PillTone = "waiting" | "progress" | "done" | "closed";

export interface RequestRow {
  readonly ticketId: string;
  readonly title: string;
  readonly word: TicketStatusWord | typeof CLOSED_LABEL;
  readonly tone: PillTone;
  /** "Website · 27 Nov". */
  readonly sub: string;
  /** The team replied and it has not been read. */
  readonly unread: boolean;
  /** Still going: not Done and not Closed. */
  readonly open: boolean;
}

function toneOf(word: TicketStatusWord | typeof CLOSED_LABEL): PillTone {
  if (word === "Quoted" || word === "Ready to check" || word === WAITING_FOR_YOU) return "waiting";
  if (word === "Done") return "done";
  if (word === CLOSED_LABEL) return "closed";
  return "progress";
}

/** A change still going: the team asking a question of the customer in it means it is the customer's turn. */
function waitingOnYou(item: RequestListItem): boolean {
  return item.ticketStatus === "waiting_on_you" && (item.change === null || customerStatus(item.change.state) !== "Done") && (item.change === null || customerStatus(item.change.state) !== CLOSED_LABEL);
}

/** The Requests list's rows, in the order given (newest activity first). A conversation wears the same words as a change, and "Waiting for you" when the team has asked something. */
export function requestRows(items: readonly RequestListItem[]): readonly RequestRow[] {
  return items.map((item): RequestRow => {
    const word = waitingOnYou(item) ? WAITING_FOR_YOU : item.change === null ? ticketStatusWord(item.ticketStatus) : customerStatus(item.change.state);
    const kind = item.change === null ? PLAIN_LABELS[item.category] : KIND_LABELS[item.change.kind];
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
  /** The customer's turn: a quote to answer, a change to check, or a question from the team. */
  readonly waiting: readonly RequestRow[];
  /** Still going and in the team's hands. */
  readonly open: readonly RequestRow[];
  readonly done: readonly RequestRow[];
}

/** The three filters above the list, "Waiting for you 1", "Open 3" and "Done 11": a closed request is filed with Done. */
export function splitRows(rows: readonly RequestRow[]): RequestFilters {
  return {
    waiting: rows.filter((row) => row.open && row.tone === "waiting"),
    open: rows.filter((row) => row.open && row.tone !== "waiting"),
    done: rows.filter((row) => !row.open),
  };
}

export type RequestFilter = "waiting" | "open" | "done";

const FILTERS: readonly RequestFilter[] = ["waiting", "open", "done"];

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
 * Works out what the Requests page shows from its address: `?filter=waiting|open|done` and `?open=<ticket>`. A request asked
 * for by address decides the filter when none is given, so the row you opened is in the list you see. With nothing asked,
 * the list opens on what is waiting for the customer, else on what is open.
 */
export function chooseView(rows: readonly RequestRow[], params: { readonly filter?: string | undefined; readonly open?: string | undefined }): ViewChoice {
  const groups = splitRows(rows);
  const asked = params.open === undefined ? undefined : rows.find((row) => row.ticketId === params.open);
  const named = FILTERS.find((value) => value === params.filter);
  const holding = asked === undefined ? undefined : FILTERS.find((value) => groups[value].includes(asked));
  const filter: RequestFilter = named ?? holding ?? (groups.waiting.length > 0 ? "waiting" : "open");
  const listed = groups[filter];
  return { filter, listed, selectedId: params.open ?? listed[0]?.ticketId ?? null, explicit: params.open !== undefined };
}

/** "This month: 1 of 2 included edits used." Null when the plan has no included edits, so the line is left out. */
export function includedHeaderLine(used: number, allowed: number): string | null {
  return allowed === 0 ? null : `This month: ${used} of ${allowed} included edits used.`;
}
