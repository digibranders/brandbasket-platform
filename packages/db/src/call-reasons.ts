/**
 * What a call is about, and the three states and two sources of a call (migration 0191). No imports, so the customer
 * pages, the console, the schema and the tests all read one list. The reasons are the same five words as a change
 * request's kinds; call-reasons.test.ts fails if the two lists ever drift apart.
 */

export const CALL_REASONS = ["website", "social", "search", "billing", "other"] as const;
export type CallReason = (typeof CALL_REASONS)[number];

/** A call is booked, then held (staff say it happened), or cancelled. A held call cannot be cancelled. */
export const CALL_STATUSES = ["booked", "held", "cancelled"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

/** Where a booking came from: the dashboard's own sheet, or Cal.com's page (a link in an email, for instance). */
export const CALL_SOURCES = ["dashboard", "booking_page"] as const;
export type CallSource = (typeof CALL_SOURCES)[number];

/** The customer's note ("Anything we should look at first?"), in characters. */
export const MAX_CALL_NOTE_LENGTH = 500;
/** What staff wrote about what was agreed, in characters. */
export const MIN_CALL_SUMMARY_LENGTH = 3;
export const MAX_CALL_SUMMARY_LENGTH = 600;

/** True for a value that is one of the reasons: narrows what a form or a query hands back. */
export function isCallReason(value: unknown): value is CallReason {
  return typeof value === "string" && (CALL_REASONS as readonly string[]).includes(value);
}
