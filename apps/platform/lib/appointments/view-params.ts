/**
 * Turns the appointments page's raw search params into one of its four views' own, always-valid params. Pure and
 * I/O-free: `today` (the business's own local date, from `localDateIn(timeZone, now)`) is the one piece of state
 * the caller supplies, so every default below is computed in the business's own time zone rather than the
 * server's.
 *
 * Every field falls back to a sensible default when missing or malformed -- there is no "invalid view" or "bad
 * date" case the page has to handle separately. A custom range that's shaped correctly but doesn't make sense (its
 * end before its start, or spanning more than a year) is the one exception: it's echoed back exactly as given,
 * with `rangeError` explaining what to fix, rather than silently replaced -- the same "echo what was typed"
 * principle every form on this dashboard follows (see lib/panel-form-state.ts).
 */
import { z } from "zod";
import { isIsoDate, mondayOf } from "@fynix/shared/lib/calendar/local-date";
import { isIsoMonth } from "./view-ranges";

export const APPOINTMENTS_VIEWS = ["today", "week", "month", "custom"] as const;
export type AppointmentsView = (typeof APPOINTMENTS_VIEWS)[number];

function isAppointmentsView(value: string): value is AppointmentsView {
  return (APPOINTMENTS_VIEWS as readonly string[]).includes(value);
}

export const MAX_CUSTOM_RANGE_DAYS = 366;
export const CUSTOM_RANGE_ORDER_MESSAGE = "Choose an end date on or after the start date.";
export const CUSTOM_RANGE_TOO_LONG_MESSAGE = `Choose a range of ${String(MAX_CUSTOM_RANGE_DAYS)} days or less.`;

export interface TodayViewParams {
  readonly view: "today";
  readonly day: string; // YYYY-MM-DD
}

export interface WeekViewParams {
  readonly view: "week";
  readonly week: string; // the Monday, YYYY-MM-DD
}

export interface MonthViewParams {
  readonly view: "month";
  readonly month: string; // YYYY-MM
}

export interface CustomViewParams {
  readonly view: "custom";
  readonly from: string; // YYYY-MM-DD
  readonly to: string; // YYYY-MM-DD
  /** Set when `from`/`to` are each real dates but the range itself doesn't make sense -- too long, or backwards.
   * The page shows this instead of querying or listing anything for the range. */
  readonly rangeError: string | null;
}

export type AppointmentsViewParams = TodayViewParams | WeekViewParams | MonthViewParams | CustomViewParams;

/** Next.js's searchParams shape: a repeated key parses as a string[]; only a plain single string is ever a real
 * value here, same as every other param this app reads (see e.g. the old page.tsx's own `rawWeek`). */
function stringParam(raw: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = raw[name];
  return typeof value === "string" ? value : undefined;
}

const RAW_SCHEMA = z.object({
  view: z.string().optional(),
  day: z.string().optional(),
  week: z.string().optional(),
  month: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Whole days from `from` to `to`, both YYYY-MM-DD (negative when `to` is before `from`) -- the same
 * date-string-only trick @fynix/shared's slots.ts uses for day maths, so this never needs a time zone. */
function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

export function parseAppointmentsViewParams(raw: Record<string, string | string[] | undefined>, today: string): AppointmentsViewParams {
  const fields = RAW_SCHEMA.parse({
    view: stringParam(raw, "view"),
    day: stringParam(raw, "day"),
    week: stringParam(raw, "week"),
    month: stringParam(raw, "month"),
    from: stringParam(raw, "from"),
    to: stringParam(raw, "to"),
  });

  const view: AppointmentsView = fields.view !== undefined && isAppointmentsView(fields.view) ? fields.view : "week";

  if (view === "today") {
    const day = fields.day !== undefined && isIsoDate(fields.day) ? fields.day : today;
    return { view: "today", day };
  }

  if (view === "month") {
    const month = fields.month !== undefined && isIsoMonth(fields.month) ? fields.month : today.slice(0, 7);
    return { view: "month", month };
  }

  if (view === "custom") {
    const from = fields.from !== undefined && isIsoDate(fields.from) ? fields.from : today;
    const to = fields.to !== undefined && isIsoDate(fields.to) ? fields.to : today;
    const span = daysBetween(from, to);
    const rangeError = span < 0 ? CUSTOM_RANGE_ORDER_MESSAGE : span + 1 > MAX_CUSTOM_RANGE_DAYS ? CUSTOM_RANGE_TOO_LONG_MESSAGE : null;
    return { view: "custom", from, to, rangeError };
  }

  const week = mondayOf(fields.week !== undefined && isIsoDate(fields.week) ? fields.week : today);
  return { view: "week", week };
}
