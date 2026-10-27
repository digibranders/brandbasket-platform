import { MAX_QUOTE_HOURS, MAX_QUOTE_WORKING_DAYS } from "@brandbasket/shared/lib/change-requests";

/** The quote form's boxes, as the browser sends them (text). */
export interface QuoteFormInput {
  readonly what: string;
  readonly hours: string;
  readonly workingDays: string;
  readonly note: string;
}

export type QuoteParse =
  | { readonly success: true; readonly data: { readonly what: string; readonly hours: number; readonly workingDays: number; readonly note: string | null } }
  | { readonly success: false; readonly message: string };

const WHAT_MIN = 3;
const WHAT_MAX = 80;
const NOTE_MAX = 2000;

/** A whole number from text: digits only, so "3 hours", "2.5" and "-1" are refused rather than guessed at. */
function whole(text: string): number | null {
  return /^[0-9]{1,3}$/.test(text.trim()) ? Number(text.trim()) : null;
}

/** Checks the quote form. The price is not here: it comes from the customer's plan, so staff never type a rate. */
export function parseQuoteForm(input: QuoteFormInput): QuoteParse {
  const what = input.what.trim();
  if (what.length < WHAT_MIN || what.length > WHAT_MAX) return { success: false, message: `Say what the quote is for in ${WHAT_MIN} to ${WHAT_MAX} characters.` };
  const hours = whole(input.hours);
  if (hours === null || hours < 1 || hours > MAX_QUOTE_HOURS) return { success: false, message: `Hours must be a whole number from 1 to ${MAX_QUOTE_HOURS}.` };
  const workingDays = whole(input.workingDays);
  if (workingDays === null || workingDays < 1 || workingDays > MAX_QUOTE_WORKING_DAYS) {
    return { success: false, message: `Working days must be a whole number from 1 to ${MAX_QUOTE_WORKING_DAYS}.` };
  }
  const note = input.note.trim();
  if (note.length > NOTE_MAX) return { success: false, message: `Keep the note to ${NOTE_MAX} characters or fewer.` };
  return { success: true, data: { what, hours, workingDays, note: note === "" ? null : note } };
}

const REASON_MIN = 3;
const REASON_MAX = 300;

export type ReasonParse = { readonly success: true; readonly reason: string } | { readonly success: false; readonly message: string };

/** The reason a request is declined: the customer reads it. */
export function parseDeclineReason(text: string): ReasonParse {
  const reason = text.trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) return { success: false, message: `Say why in ${REASON_MIN} to ${REASON_MAX} characters.` };
  return { success: true, reason };
}
