/**
 * The Add booking page's query params and the links that carry them. Pure and I/O-free, like
 * lib/appointments/view-params.ts: every param falls back to something harmless when missing or malformed, and the
 * page (with its own reads) decides whether a well-shaped id actually names this clinic's doctor or patient.
 */
import { z } from "zod";
import { isIsoDate } from "@firstfold/shared/lib/calendar/local-date";

/** Mirrors parseManualBooking's own start check: the only times the slot grid ever offers. */
const SLOT_START = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuidFormat = z.uuid();

export interface AddBookingParams {
  /** YYYY-MM-DD, or null for the business-local today. */
  readonly date: string | null;
  /** A doctor's id, or null for any doctor. */
  readonly doctor: string | null;
  /** "HH:MM", or null when no time has been picked yet. */
  readonly slot: string | null;
  /** The patient Book again was pressed for, or null for someone new. */
  readonly patient: string | null;
}

/** Next.js's searchParams shape: a repeated key arrives as a string[]; only a single string is ever a real value. */
function stringParam(raw: Readonly<Record<string, string | string[] | undefined>>, name: string): string {
  const value = raw[name];
  return typeof value === "string" ? value.trim() : "";
}

function uuidOrNull(value: string): string | null {
  return uuidFormat.safeParse(value).success ? value : null;
}

/**
 * `date` must be a real calendar date; `doctor` a uuid ("any", blank or anything else is any doctor); `slot` an
 * "HH:MM" time. `patient` is kept whenever it is present, malformed or not, so the page can say "Patient not found."
 * for it rather than quietly dropping what Book again asked for.
 */
export function parseAddBookingParams(raw: Readonly<Record<string, string | string[] | undefined>>): AddBookingParams {
  const date = stringParam(raw, "date");
  const slot = stringParam(raw, "slot");
  const patient = stringParam(raw, "patient");
  return {
    date: isIsoDate(date) ? date : null,
    doctor: uuidOrNull(stringParam(raw, "doctor")),
    slot: SLOT_START.test(slot) ? slot : null,
    patient: patient === "" ? null : patient,
  };
}

export interface AddBookingLink {
  readonly date: string;
  readonly doctor: string | null;
  readonly patient: string | null;
  readonly slot: string | null;
}

/** A link within Add booking. Params are written in one fixed order, and a null one is left out. */
export function addBookingHref(link: AddBookingLink): string {
  const query = new URLSearchParams({ date: link.date });
  if (link.doctor !== null) query.set("doctor", link.doctor);
  if (link.patient !== null) query.set("patient", link.patient);
  if (link.slot !== null) query.set("slot", link.slot);
  return `/appointments/new?${query.toString()}`;
}

/** The Appointments Today view for `date` (Close), or for the business-local today when it isn't known. */
export function dayViewHref(date: string | null): string {
  const query = new URLSearchParams({ view: "today" });
  if (date !== null) query.set("day", date);
  return `/appointments?${query.toString()}`;
}

/** Where a successful booking lands: its day, with its details panel open. */
export function bookedHref(date: string, appointmentId: string): string {
  const query = new URLSearchParams({ view: "today", day: date, booking: appointmentId });
  return `/appointments?${query.toString()}`;
}
