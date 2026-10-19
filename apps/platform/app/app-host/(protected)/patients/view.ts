/**
 * The patient register's pure view pieces, I/O-free so they can be unit tested: reading the list page's `?filter=`,
 * building its links, the short dates its rows use, a profile's figures from its history, and the link from a
 * history row to that booking in Appointments.
 *
 * Every date string in and out is the business's own local calendar date (YYYY-MM-DD), the same convention as
 * lib/appointments/date-format.ts: the page reads "today" and the current year from `localDateIn(timeZone, now)`.
 */
import type { AppointmentRow, PatientFilter } from "@brandbasket/db";

export const PATIENT_FILTERS: readonly PatientFilter[] = ["all", "upcoming", "new", "lapsed"];

export const PATIENT_FILTER_LABELS: Readonly<Record<PatientFilter, string>> = {
  all: "All",
  upcoming: "Upcoming",
  new: "New this month",
  lapsed: "Not seen in 6 months",
};

/** Patients per page of the list. Well under listPatients' own 200 clamp; small enough that a phone isn't
 * scrolling for ever, big enough that most clinics' "Upcoming" fits on one page. */
export const PATIENT_PAGE_SIZE = 25;

/** Far beyond any real register (250,000 patients at 25 a page); only here so a hand-typed `?page=` can't turn into
 * an absurd OFFSET. */
const MAX_PAGE = 10_000;

/** `?filter=` as one of the four filters. Anything else -- missing, repeated, a typo -- is All, the same "every
 * param falls back to something sensible" rule the appointments views follow. */
export function parsePatientFilter(raw: string | readonly string[] | undefined): PatientFilter {
  if (typeof raw !== "string") return "all";
  return PATIENT_FILTERS.find((filter) => filter === raw) ?? "all";
}

/** `?page=` as a page number from 1. Anything that isn't a plain positive whole number -- missing, repeated, "0",
 * "2.5", "abc" -- is page 1; anything past MAX_PAGE is MAX_PAGE (the page then finds no rows and goes back to 1). */
export function parsePageParam(raw: string | readonly string[] | undefined): number {
  if (typeof raw !== "string" || !/^\d{1,6}$/.test(raw)) return 1;
  const page = Number(raw);
  return page < 1 ? 1 : Math.min(page, MAX_PAGE);
}

/** How many pages `total` matches make; at least 1, so an empty list is still "page 1 of 1". */
export function pageCount(total: number, pageSize: number = PATIENT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** One entry in the page-number row: a page to link to, or a gap standing for the pages left out. */
export type PageItem = { readonly kind: "page"; readonly page: number } | { readonly kind: "gap"; readonly key: string };

/**
 * The page numbers to show for `current` of `pages`: always the first and last, the current one and one either
 * side, with a gap wherever pages are skipped -- e.g. 1 … 4 5 6 … 12. A gap only ever replaces two or more pages:
 * where it would hide exactly one, that page is shown instead, since a gap is no shorter than a number.
 */
export function pageItems(current: number, pages: number): readonly PageItem[] {
  const shown = new Set<number>([1, pages, current - 1, current, current + 1].filter((page) => page >= 1 && page <= pages));
  const sorted = [...shown].sort((left, right) => left - right);
  const items: PageItem[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous === 2) items.push({ kind: "page", page: previous + 1 });
    else if (page - previous > 2) items.push({ kind: "gap", key: `gap-${String(previous)}` });
    items.push({ kind: "page", page });
    previous = page;
  }
  return items;
}

/** The list page's own address for a filter, a search and a page. All, a blank search and page 1 are left out, so
 * the plain "/patients" is the page's canonical first page of All; a filter link keeps the search and the search
 * form keeps the filter, so narrowing one never drops the other. Changing the filter or the search always starts
 * again at page 1 (their links and form never carry a page): page 4 of a different list means nothing. */
export function patientsHref(filter: PatientFilter, search: string, page: number = 1): string {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("filter", filter);
  if (search !== "") query.set("q", search);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text === "" ? "/patients" : `/patients?${text}`;
}

/** "Showing 26–50 of 212", for above the list when it runs to more than one page. */
export function pageRangeLabel(page: number, rowCount: number, total: number, pageSize: number = PATIENT_PAGE_SIZE): string {
  const first = (page - 1) * pageSize + 1;
  return `Showing ${String(first)}–${String(first + rowCount - 1)} of ${String(total)}`;
}

/** What the list says when nothing matches: the search named when there is one, else the filter's own case. */
export function emptyListLabel(filter: PatientFilter, search: string): string {
  if (search !== "") return "No patients match that search.";
  switch (filter) {
    case "all":
      return "No patients yet.";
    case "upcoming":
      return "No upcoming visits.";
    case "new":
      return "No new patients this month.";
    case "lapsed":
      return "Everyone has been seen recently.";
  }
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_SHORT_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** "2026-09-28" -> "28 Sep", with the year appended ("28 Sep 2025") only when it isn't `currentYear`: the list's
 * last and next visit columns, where the appointments pages' long "Monday 28 September" would not fit. */
export function formatShortDate(value: string, currentYear: number): string {
  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Expected a YYYY-MM-DD date, received ${value}`);
  const year = Number(match[1]);
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[3])));
  const base = `${String(Number(match[3]))} ${MONTH_SHORT_FORMAT.format(date)}`;
  return year === currentYear ? base : `${base} ${String(year)}`;
}

/** Where a history row opens: that booking's details in Appointments, on the Today view of its own day. */
export function appointmentHref(appointment: Pick<AppointmentRow, "id" | "localDate">): string {
  const query = new URLSearchParams({ view: "today", day: appointment.localDate, booking: appointment.id });
  return `/appointments?${query.toString()}`;
}

export interface PatientFigures {
  /** Bookings marked Attended. */
  readonly visits: number;
  readonly noShows: number;
  /** The earliest booked appointment starting after `now`, or null when nothing is booked ahead. */
  readonly next: AppointmentRow | null;
}

/** A profile's figures from its whole history (any order): the same definitions listPatients uses for its columns,
 * worked out from the rows the profile already read rather than a second query. */
export function patientFigures(history: readonly AppointmentRow[], now: Date): PatientFigures {
  let visits = 0;
  let noShows = 0;
  let next: AppointmentRow | null = null;
  for (const appointment of history) {
    if (appointment.status === "done") visits += 1;
    else if (appointment.status === "no_show") noShows += 1;
    else if (appointment.status === "booked" && appointment.startsAt.getTime() > now.getTime()) {
      if (next === null || appointment.startsAt.getTime() < next.startsAt.getTime()) next = appointment;
    }
  }
  return { visits, noShows, next };
}

/** "1 visit" / "3 visits"; also "booking(s)" for the merge confirm. */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
