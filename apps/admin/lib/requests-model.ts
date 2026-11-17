import type { ChangeCoverage, ChangeState } from "@brandbasket/db/change-states";
import type { SupportStatus } from "@brandbasket/shared/lib/support";
import { replyClock, waitingLabel, type RequestQueue, type WaitingTone } from "./reply-clock";

/** What a request is: a plain support ticket, or a ticket with change request details. */
export type RequestType = "support" | "change";

export type ChipVariant = "idle" | "waiting" | "active" | "failed";

export interface RowChip {
  readonly label: string;
  readonly variant: ChipVariant;
}

/** The change details a row needs; a subset of `ChangeView` that survives the server to client boundary. */
export interface RowChange {
  readonly state: ChangeState;
  readonly coverage: ChangeCoverage;
  readonly accepted: boolean;
  readonly paid: boolean;
}

/** One line of the list. Plain data: it crosses from the server page to the client list. */
export interface RequestRow {
  readonly id: string;
  readonly displayRef: string;
  readonly subject: string;
  readonly businessId: string | null;
  readonly businessName: string | null;
  readonly categoryLabel: string;
  readonly status: SupportStatus;
  readonly queue: RequestQueue;
  readonly type: RequestType;
  readonly change: RowChange | null;
  /** The clock column, already worded ("1d 03h"), with how urgent it is. Null for a finished request. */
  readonly clock: { readonly text: string; readonly tone: WaitingTone; readonly running: boolean } | null;
  readonly chips: readonly RowChip[];
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** "45m", "9h 10m" or "1d 03h": the clocks in the Requests list and panel. */
export function clockText(ms: number): string {
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / MINUTE_MS);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(safe / HOUR_MS);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d ${String(hours % 24).padStart(2, "0")}h`;
}

/** What the change is waiting for, in the team's words. */
export function changeChip(change: RowChange): RowChip {
  switch (change.state) {
    case "requested":
      return { label: "Needs a quote", variant: "waiting" };
    case "quoted":
      return { label: "Quote not paid", variant: "waiting" };
    case "in_progress":
      return change.paid ? { label: "Paid, in progress", variant: "active" } : { label: "In progress", variant: "idle" };
    case "preview":
      return { label: "Sent for checking", variant: "idle" };
    case "revisions":
      return { label: "Fix asked", variant: "waiting" };
    case "approved":
      return { label: "Approved", variant: "idle" };
    case "shipped":
      return { label: "Done", variant: "active" };
    case "declined":
      return { label: "Declined", variant: "idle" };
    case "withdrawn":
      return { label: "Quote turned down", variant: "idle" };
  }
}

interface RowInput {
  readonly status: SupportStatus;
  readonly lastCustomerMessageAt: Date | null;
  readonly lastStaffReplyAt: Date | null;
  readonly lastActivityAt: Date;
  readonly change: RowChange | null;
}

/** The queue, clock and chips of one request. `now` is passed in so the result is the same wherever it runs. */
export function describeRequest(input: RowInput, now: Date): Pick<RequestRow, "queue" | "type" | "clock" | "chips"> {
  const { queue, waitingSince } = replyClock(input);
  const type: RequestType = input.change === null ? "support" : "change";
  const chips: RowChip[] = [{ label: type === "support" ? "Support" : "Change", variant: "idle" }];
  let clock: RequestRow["clock"] = null;
  if (queue === "needs_reply" && waitingSince !== null) {
    const tone = waitingLabel(waitingSince, now).tone;
    clock = { text: clockText(now.getTime() - waitingSince.getTime()), tone, running: true };
  } else if (queue === "waiting_on_client") {
    clock = { text: clockText(now.getTime() - input.lastActivityAt.getTime()), tone: "ok", running: false };
  }
  if (input.change !== null) chips.push(changeChip(input.change));
  else if (queue === "done") chips.push({ label: "Closed", variant: "active" });
  if (clock?.running === true && clock.tone === "late") chips.push({ label: "Late", variant: "failed" });
  else if (clock?.running === true && clock.tone === "soon") chips.push({ label: "Past 4 hours", variant: "waiting" });
  return { queue, type, clock, chips };
}

export interface ThreadBanner {
  readonly tone: "late" | "soon" | "ok" | "neutral";
  /** The state in words. */
  readonly text: string;
  /** The running clock, when someone is waiting on the team. */
  readonly clock: string | null;
  readonly note: string | null;
}

/**
 * The banner above a conversation. It is worked out from the messages as they stand, so it follows the last message:
 * after a reply it reads "Waiting on the customer" and after a customer message it reads "Waiting on you".
 */
export function threadBanner(input: { readonly status: SupportStatus; readonly lastCustomerMessageAt: Date | null; readonly lastStaffReplyAt: Date | null }, now: Date): ThreadBanner {
  const { queue, waitingSince } = replyClock(input);
  if (queue === "done") return { tone: "ok", text: "Closed. Nothing is waiting.", clock: null, note: null };
  if (queue === "waiting_on_client" || waitingSince === null) return { tone: "neutral", text: "Waiting on the customer", clock: null, note: "Your reply is the newest message." };
  const tone = waitingLabel(waitingSince, now).tone;
  const note = tone === "late" ? "The 4 hour promise was missed." : tone === "soon" ? "Past 4 hours." : null;
  return { tone, text: "Waiting on you", clock: clockText(now.getTime() - waitingSince.getTime()), note };
}

/** The queue a client's Requests tab shows: any of the three, or everything. */
export type ClientQueue = RequestQueue | "all";

export interface ListLocation {
  readonly queue: ClientQueue;
  readonly search?: string;
  readonly category?: string;
  readonly open?: string | null;
  readonly cursor?: string;
}

/** The address of a list view. A value that is the default for the page is left out, so the plain page stays `basePath`. */
export function listHref(basePath: string, defaultQueue: ClientQueue, location: ListLocation): string {
  const params = new URLSearchParams();
  if (location.queue !== defaultQueue) params.set("queue", location.queue);
  if (location.category !== undefined && location.category !== "") params.set("category", location.category);
  if (location.search !== undefined && location.search !== "") params.set("search", location.search);
  if (location.cursor !== undefined) params.set("cursor", location.cursor);
  if (location.open !== undefined && location.open !== null) params.set("open", location.open);
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}

/** The client tab's filter from its address. Anything unknown is "all": a client's list never opens empty by default. */
export function readClientQueue(raw: string | string[] | undefined): ClientQueue {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "needs_reply" || value === "waiting_on_client" || value === "done" ? value : "all";
}
