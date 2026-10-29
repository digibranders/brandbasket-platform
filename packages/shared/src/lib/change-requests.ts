import type { ChangeState } from "@brandbasket/db/change-states";
import { localDateIn } from "./calendar/local-date";
import { formatMoney, type MoneyCurrency } from "./money";
import type { SupportStatus } from "./support";

/*
 * The rules of a change request that the customer's pages, the console and the emails all read. Pure, so it is safe in
 * the browser. The numbers below are the ONE place the included-edits rule lives: the sources disagree on its size
 * (docs/plans/31-platform-requests.md, "Questions for the owner"), and changing it is a change to this file only.
 */

/** Included edits a month on the Managed Website service (the checkout page says "2 small content edits a month"). */
export const INCLUDED_EDITS_PER_MONTH = 2;
/** How long one included edit may take. The website's terms say 15 minutes; an older plan said 30. */
export const INCLUDED_EDIT_MINUTES = 15;
/** Working days from the day an included edit is sent to "ready to check". */
export const INCLUDED_EDIT_WORKING_DAYS = 2;
/** A finished change, or a quote turned down, can be reopened for this many days. The database function holds the same number. */
export const REOPEN_WINDOW_DAYS = 14;
export const MAX_QUOTE_HOURS = 40;
export const MAX_QUOTE_WORKING_DAYS = 30;
/** Where the team works: the month an edit counts in, and every date shown, is India's. */
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

/** The five words the customer sees, the same in the list, the stepper, the emails and the bell. */
export const CUSTOMER_STATUSES = ["Sent", "Quoted", "In progress", "Ready to check", "Done"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

/** The word for a request that ended without the change being made (declined by the team, or not now from the customer). */
export const CLOSED_LABEL = "Closed";

/** The customer's word for each of the nine states. Sent, Quoted, In progress (also revisions), Ready to check, Done (approved or shipped). */
export function customerStatus(state: ChangeState): CustomerStatus | typeof CLOSED_LABEL {
  switch (state) {
    case "requested":
      return "Sent";
    case "quoted":
      return "Quoted";
    case "in_progress":
    case "revisions":
      return "In progress";
    case "preview":
      return "Ready to check";
    case "approved":
    case "shipped":
      return "Done";
    case "declined":
    case "withdrawn":
      return CLOSED_LABEL;
  }
}

/** Which of the five steps the request has reached (0 to 4), or null when it ended without the change being made. */
export function customerStepIndex(state: ChangeState): number | null {
  const word = customerStatus(state);
  return word === CLOSED_LABEL ? null : CUSTOMER_STATUSES.indexOf(word);
}

/** The word a ticket wears when the team has asked the customer something and is waiting for the answer. Not one of the five steps of a change. */
export const WAITING_FOR_YOU = "Waiting for you";
export type TicketStatusWord = CustomerStatus | typeof WAITING_FOR_YOU;

/** A question (a ticket with no change details) uses the same words: new is Sent, being worked on is In progress, resolved or closed is Done, and a question to the customer is Waiting for you. */
export function ticketStatusWord(status: SupportStatus): TicketStatusWord {
  switch (status) {
    case "new":
      return "Sent";
    case "triaged":
    case "in_progress":
      return "In progress";
    case "waiting_on_you":
      return WAITING_FOR_YOU;
    case "resolved":
    case "closed":
      return "Done";
  }
}

/** How many included edits a business has in a month: the Managed Website service carries them, no other service does. */
export function includedEditsAllowed(hasWebsite: boolean): number {
  return hasWebsite ? INCLUDED_EDITS_PER_MONTH : 0;
}

/** "1 of 2 used". */
export function includedEditsUsedLine(used: number, allowed: number): string {
  return `${used} of ${allowed} used`;
}

/**
 * The month `at` falls in, in India, from its first moment (inclusive) to the first moment of the next month (exclusive).
 * An included edit counts in the month it was sent. India has no daylight saving, so the offset is fixed.
 */
export function monthBoundsIst(at: Date): { readonly from: Date; readonly to: Date } {
  const [year, month] = localDateIn(BUSINESS_TIME_ZONE, at).split("-").map(Number);
  if (year === undefined || month === undefined) throw new RangeError("Could not read the month of the date.");
  const start = (y: number, m: number): Date => new Date(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01T00:00:00+05:30`);
  return { from: start(year, month), to: month === 12 ? start(year + 1, 1) : start(year, month + 1) };
}

/** "1 hour", "3 hours". */
export function hoursLabel(hours: number): string {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** What a quote comes to: whole hours at the hour's price (GST included in rupees, nothing added on top). */
export function quoteTotalCents(hours: number, unitCents: number): number {
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_QUOTE_HOURS) throw new RangeError(`A quote is for 1 to ${MAX_QUOTE_HOURS} whole hours, received ${hours}`);
  if (!Number.isSafeInteger(unitCents) || unitCents < 1) throw new RangeError(`The hour's price must be a whole number of minor units, received ${unitCents}`);
  return hours * unitCents;
}

export interface QuoteLineInput {
  readonly what: string;
  readonly hours: number;
  readonly unitCents: number;
  readonly currency: MoneyCurrency;
}

/** The quote in one line, as the next-step box and the email say it: "New page, 3 hours at ₹500 an hour, GST included". */
export function quoteLine(quote: QuoteLineInput): string {
  const gst = quote.currency === "INR" ? ", GST included" : "";
  return `${quote.what}, ${hoursLabel(quote.hours)} at ${formatMoney(quote.unitCents, quote.currency)} an hour${gst}`;
}

/** The label on the one dark button of a quote: "Accept and pay ₹1,500". */
export function acceptLabel(amountCents: number, currency: MoneyCurrency): string {
  return `Accept and pay ${formatMoney(amountCents, currency)}`;
}
