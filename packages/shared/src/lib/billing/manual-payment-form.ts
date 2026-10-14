import { z } from "zod";

export const MANUAL_PAYMENT_CONFIRM_FIELD = "confirmReceived";
export const MANUAL_PAYMENT_REFERENCE_FIELD = "reference";
export const MANUAL_PAYMENT_RECEIVED_ON_FIELD = "receivedOn";

export const MAX_MANUAL_REFERENCE_LENGTH = 100;
/** How far back a received date may go. Anything older is almost certainly a typo in the year. */
export const MAX_RECEIVED_DAYS_AGO = 366;
/**
 * The furthest ahead of UTC any time zone runs (UTC+14). "Today" for the admin can be up to this far ahead of the
 * server's UTC date, so a received date is only refused once it is in the future everywhere.
 */
const LATEST_ZONE_OFFSET_MS = 14 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What an admin states about money that arrived outside the payment provider. */
export interface ManualPaymentDetails {
  /** The bank or payment reference, trimmed. */
  readonly reference: string;
  /** The calendar date the money arrived, `YYYY-MM-DD`. */
  readonly receivedOn: string;
}

export type ManualPaymentFormProblem = "unconfirmed" | "missing-reference" | "invalid-date";

export type ManualPaymentForm =
  | { readonly ok: true; readonly details: ManualPaymentDetails }
  | { readonly ok: false; readonly problem: ManualPaymentFormProblem };

/** A `YYYY-MM-DD` string for the UTC calendar date of `date`. */
export function utcCalendarDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("Date must be a valid Date");
  return date.toISOString().slice(0, 10);
}

/** The `YYYY-MM-DD` calendar date of `date` in `timeZone`. */
export function calendarDateIn(date: Date, timeZone: string): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("Date must be a valid Date");
  // en-CA formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const calendarDate = z.iso.date();

/** A real calendar date no later than today anywhere on earth, and no more than MAX_RECEIVED_DAYS_AGO before it. */
export function isAcceptableReceivedDate(value: string, now: Date): boolean {
  if (!calendarDate.safeParse(value).success) return false;
  const latest = utcCalendarDate(new Date(now.getTime() + LATEST_ZONE_OFFSET_MS));
  const earliest = utcCalendarDate(new Date(now.getTime() - MAX_RECEIVED_DAYS_AGO * DAY_MS));
  // YYYY-MM-DD strings compare in date order.
  return value >= earliest && value <= latest;
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads the Record a manual payment form. The admin must tick that the money has arrived, give the reference it
 * came with, and the date it arrived. Nothing else posted is trusted: the amount is always the plan's.
 */
export function parseManualPaymentForm(formData: FormData, now: Date): ManualPaymentForm {
  if (formData.get(MANUAL_PAYMENT_CONFIRM_FIELD) !== "yes") return { ok: false, problem: "unconfirmed" };
  const reference = text(formData.get(MANUAL_PAYMENT_REFERENCE_FIELD));
  if (reference === "" || reference.length > MAX_MANUAL_REFERENCE_LENGTH) {
    return { ok: false, problem: "missing-reference" };
  }
  const receivedOn = text(formData.get(MANUAL_PAYMENT_RECEIVED_ON_FIELD));
  if (!isAcceptableReceivedDate(receivedOn, now)) return { ok: false, problem: "invalid-date" };
  return { ok: true, details: { reference, receivedOn } };
}
