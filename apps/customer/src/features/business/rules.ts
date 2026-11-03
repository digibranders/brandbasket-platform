import type { BusinessHoursInput } from "@brandbasket/db";
import { MAX_PHOTOS, MAX_UPLOAD_SIZE_LABEL } from "@brandbasket/shared/lib/uploads/limits";
import { z } from "zod";

/*
 * The Business profile's pure rules, ported from apps/platform: lib/onboarding/business-form.ts (hours),
 * packages/shared lib/business-facts (announcement, closures), lib/onboarding/hours.ts, lib/onboarding/brand-form.ts and
 * lib/details/form-snapshot.ts. No I/O. The contact fields (which need the phone library) are in ./contact-form.ts.
 */

export { MAX_PHOTOS, MAX_UPLOAD_SIZE_LABEL };

// ---------------------------------------------------------------------------------------------------------------
// Dates and text
// ---------------------------------------------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** A real calendar date `YYYY-MM-DD` (2026-02-30 is not), with the year in the range Postgres date columns and this app deal in. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Control characters other than tab, line feed and carriage return, plus DEL. Written as escapes so the file stays text. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LINE_BREAKS = /[\r\n]+/g;
const HAS_LINE_BREAK = /[\r\n\u2028\u2029]/;

/** For single-line values: line breaks become a space, other control characters go, ends are trimmed. */
export function cleanLine(value: string): string {
  return value.replace(LINE_BREAKS, " ").replace(CONTROL_CHARACTERS, "").trim();
}

const text = z.string().default("");

// ---------------------------------------------------------------------------------------------------------------
// Contact field limits (enforced in ./contact-form.ts, shown as maxLength by the form)
// ---------------------------------------------------------------------------------------------------------------

export const CONTACT_LIMITS = {
  displayName: 120,
  addressLine: 120,
  city: 80,
  region: 80,
  postalCode: 20,
  country: 80,
  serviceAreas: 300,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------------------------------------------

/** Index is the stored day_of_week: Monday is 0. */
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** What the editor offers for each day. "unset" saves nothing for that day. */
export const DAY_MODES = ["unset", "open", "closed", "all-day"] as const;
export type DayMode = (typeof DAY_MODES)[number];

export const DAY_MODE_LABELS: Readonly<Record<DayMode, string>> = {
  unset: "Not set",
  open: "Open",
  closed: "Closed",
  "all-day": "Open 24 hours",
};

export const NEXT_DAY_NOTE = "(next day)";
const ROUND_THE_CLOCK_MESSAGE = "For round-the-clock opening, choose Open 24 hours.";
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDayMode(value: string): value is DayMode {
  return (DAY_MODES as readonly string[]).includes(value);
}

/** Opening hours as the customer sees them. A closing time earlier than the opening time closes after midnight; equal times are never stored. */
export type OpeningHours =
  | { readonly dayOfWeek: number; readonly mode: "closed" }
  | { readonly dayOfWeek: number; readonly mode: "all-day" }
  | { readonly dayOfWeek: number; readonly mode: "open"; readonly opensAt: string; readonly closesAt: string };

/** One row as the business_hours table holds it. */
export type StoredHoursRow = BusinessHoursInput;

/** Both `HH:MM`. True when the day closes after midnight. */
export function closesNextDay(opensAt: string, closesAt: string): boolean {
  return closesAt < opensAt;
}

export function toStoredHours(day: OpeningHours): StoredHoursRow {
  switch (day.mode) {
    case "closed":
      return { dayOfWeek: day.dayOfWeek, opensAt: null, closesAt: null, closed: true, openAllDay: false };
    case "all-day":
      return { dayOfWeek: day.dayOfWeek, opensAt: null, closesAt: null, closed: false, openAllDay: true };
    case "open":
      return { dayOfWeek: day.dayOfWeek, opensAt: day.opensAt, closesAt: day.closesAt, closed: false, openAllDay: false };
  }
}

/** A stored row as the customer sees it, or null for a row that cannot be shown (the database refuses those). Postgres `HH:MM:SS` becomes `HH:MM`. */
export function fromStoredHours(row: StoredHoursRow): OpeningHours | null {
  if (row.closed) return { dayOfWeek: row.dayOfWeek, mode: "closed" };
  if (row.openAllDay) return { dayOfWeek: row.dayOfWeek, mode: "all-day" };
  if (row.opensAt === null || row.closesAt === null) return null;
  return { dayOfWeek: row.dayOfWeek, mode: "open", opensAt: row.opensAt.slice(0, 5), closesAt: row.closesAt.slice(0, 5) };
}

/** The form field holding one part of a day: `hours.{day}.mode|opens|closes`, exactly as the old editor named them. */
export function hoursField(dayOfWeek: number, part: "mode" | "opens" | "closes"): string {
  return `hours.${dayOfWeek}.${part}`;
}

/** The editor's starting values for the whole week from the stored rows. A day with several stored rows (staff may enter split shifts) shows its first open one. */
export function hoursFormValues(rows: readonly StoredHoursRow[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let day = 0; day < WEEKDAYS.length; day += 1) {
    const shown = rows
      .filter((row) => row.dayOfWeek === day)
      .map(fromStoredHours)
      .filter((entry): entry is OpeningHours => entry !== null);
    const entry = shown.find((candidate) => candidate.mode !== "closed") ?? shown[0];
    values[hoursField(day, "mode")] = entry?.mode ?? "unset";
    values[hoursField(day, "opens")] = entry?.mode === "open" ? entry.opensAt : "";
    values[hoursField(day, "closes")] = entry?.mode === "open" ? entry.closesAt : "";
  }
  return values;
}

function value(raw: Record<string, unknown>, key: string): string {
  const entry = raw[key];
  return typeof entry === "string" ? entry.trim() : "";
}

/**
 * The week's hours form, read from the flat `hours.{day}.mode|opens|closes` fields. A day not sent reads as "unset" and is
 * left out. Only an open day keeps its times. Output is the days to store, Monday first.
 */
export const hoursSchema = z.looseObject({}).transform((raw, context): readonly OpeningHours[] => {
  const days: OpeningHours[] = [];
  for (let dayOfWeek = 0; dayOfWeek < WEEKDAYS.length; dayOfWeek += 1) {
    const mode = value(raw, hoursField(dayOfWeek, "mode")) || "unset";
    const opens = value(raw, hoursField(dayOfWeek, "opens"));
    const closes = value(raw, hoursField(dayOfWeek, "closes"));
    if (!isDayMode(mode)) {
      context.addIssue({
        code: "custom",
        path: [hoursField(dayOfWeek, "mode")],
        message: "Choose how this day works: not set, open, closed or open 24 hours.",
      });
      continue;
    }
    if (mode === "unset") continue;
    if (mode !== "open") {
      days.push({ dayOfWeek, mode });
      continue;
    }
    if (!TIME_OF_DAY.test(opens)) {
      context.addIssue({ code: "custom", path: [hoursField(dayOfWeek, "opens")], message: "Add an opening time, or choose another option for this day." });
    } else if (!TIME_OF_DAY.test(closes)) {
      context.addIssue({ code: "custom", path: [hoursField(dayOfWeek, "closes")], message: "Add a closing time, or choose another option for this day." });
    } else if (opens === closes) {
      context.addIssue({ code: "custom", path: [hoursField(dayOfWeek, "closes")], message: ROUND_THE_CLOCK_MESSAGE });
    } else {
      days.push({ dayOfWeek, mode: "open", opensAt: opens, closesAt: closes });
    }
  }
  return days;
});

// ---------------------------------------------------------------------------------------------------------------
// Announcement
// ---------------------------------------------------------------------------------------------------------------

export const ANNOUNCEMENT_MAX_LENGTH = 100;
/** How far ahead a fresh announcement defaults to running, when nothing is saved yet. */
export const DEFAULT_ANNOUNCEMENT_DAYS = 2;

export interface Announcement {
  readonly message: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

/**
 * One line, 1 to 100 characters, with start and end days and the end not before the start. The line-break test reads the RAW
 * value: cleaning turns a break into a space, so afterwards a single line and a two-line message look the same.
 */
export const announcementSchema = z
  .object({ message: text, startsOn: text, endsOn: text })
  .superRefine((form, context) => {
    const message = cleanLine(form.message);
    if (HAS_LINE_BREAK.test(form.message) || message.length < 1 || message.length > ANNOUNCEMENT_MAX_LENGTH) {
      context.addIssue({
        code: "custom",
        path: ["message"],
        message: `Write the announcement in one line, up to ${ANNOUNCEMENT_MAX_LENGTH} characters.`,
      });
    }
    const startsOn = form.startsOn.trim();
    const endsOn = form.endsOn.trim();
    if (!isIsoDate(startsOn)) context.addIssue({ code: "custom", path: ["startsOn"], message: "Choose the day it starts." });
    if (!isIsoDate(endsOn)) context.addIssue({ code: "custom", path: ["endsOn"], message: "Choose the last day it shows." });
    else if (isIsoDate(startsOn) && endsOn < startsOn) {
      context.addIssue({ code: "custom", path: ["endsOn"], message: "The last day can't be before the first." });
    }
  })
  .transform((form): Announcement => ({ message: cleanLine(form.message), startsOn: form.startsOn.trim(), endsOn: form.endsOn.trim() }));

/** "Showing until ...", "Starts ..." for one that has not started, or "Ended" for one whose last day passed but is not removed yet. */
export type AnnouncementStatus = { readonly kind: "starts"; readonly on: string } | { readonly kind: "showing"; readonly until: string } | { readonly kind: "ended" };

export function announcementStatus(announcement: Announcement, today: string): AnnouncementStatus {
  if (today < announcement.startsOn) return { kind: "starts", on: announcement.startsOn };
  if (today > announcement.endsOn) return { kind: "ended" };
  return { kind: "showing", until: announcement.endsOn };
}

// ---------------------------------------------------------------------------------------------------------------
// Closures ("Holidays")
// ---------------------------------------------------------------------------------------------------------------

export const CLOSURE_NOTE_MAX_LENGTH = 80;
export const CLOSURE_NOT_FOUND_MESSAGE = "That closure could not be found. Reload the page.";
export const CLOSURE_PAST_MESSAGE = "Choose dates from today onwards.";

export interface Closure {
  readonly id: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly note: string | null;
  /** `HH:MM`, both or neither: the shorter hours kept on these days (a half day). Neither means shut all day. */
  readonly opensAt?: string | null;
  readonly closesAt?: string | null;
}

export interface ClosureInput {
  readonly startsOn: string;
  readonly endsOn: string;
  readonly note: string | null;
  /** Both `HH:MM` for a half day, both null for a day shut all day. */
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

/** Closures that have not ended by `today`, soonest first. */
export function upcomingClosures<T extends Closure>(closures: readonly T[], today: string): T[] {
  return closures.filter((closure) => closure.endsOn >= today).sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));
}

/** True when the closure's last day is already past in the business's own time zone (`today` is that zone's date). */
export function closureEnded(closure: Pick<ClosureInput, "endsOn">, today: string): boolean {
  return closure.endsOn < today;
}

/**
 * A holiday: first and last day, an optional one-line note up to 80 characters, and with `kind=hours` both an opening and a
 * closing time that differ. Stored `opensAt` and `closesAt` are both set or both null.
 */
export const closureSchema = z
  .object({ startsOn: text, endsOn: text, note: text, kind: text, opensAt: text, closesAt: text })
  .superRefine((form, context) => {
    const startsOn = form.startsOn.trim();
    const endsOn = form.endsOn.trim();
    if (!isIsoDate(startsOn)) context.addIssue({ code: "custom", path: ["startsOn"], message: "Choose the first closed day." });
    if (!isIsoDate(endsOn)) context.addIssue({ code: "custom", path: ["endsOn"], message: "Choose the last closed day." });
    else if (isIsoDate(startsOn) && endsOn < startsOn) {
      context.addIssue({ code: "custom", path: ["endsOn"], message: "The last day can't be before the first." });
    }
    if (HAS_LINE_BREAK.test(form.note) || cleanLine(form.note).length > CLOSURE_NOTE_MAX_LENGTH) {
      context.addIssue({ code: "custom", path: ["note"], message: `Keep the note to ${CLOSURE_NOTE_MAX_LENGTH} characters.` });
    }
    if (form.kind !== "hours") return;
    const opensAt = form.opensAt.trim();
    const closesAt = form.closesAt.trim();
    if (!TIME_OF_DAY.test(opensAt)) context.addIssue({ code: "custom", path: ["opensAt"], message: "Choose the time you open." });
    else if (!TIME_OF_DAY.test(closesAt)) context.addIssue({ code: "custom", path: ["closesAt"], message: "Choose the time you close." });
    else if (opensAt === closesAt) context.addIssue({ code: "custom", path: ["closesAt"], message: "Opening and closing can't be the same time." });
  })
  .transform((form): ClosureInput => {
    const note = cleanLine(form.note);
    const half = form.kind === "hours";
    return {
      startsOn: form.startsOn.trim(),
      endsOn: form.endsOn.trim(),
      note: note === "" ? null : note,
      opensAt: half ? form.opensAt.trim() : null,
      closesAt: half ? form.closesAt.trim() : null,
    };
  });

// ---------------------------------------------------------------------------------------------------------------
// Messages every action shares
// ---------------------------------------------------------------------------------------------------------------

export const VIEWER_MESSAGE = "Only the owner or an editor can change this.";
export const SAVE_FAILED_MESSAGE = "We could not save that. Try again.";
export const REMOVE_FAILED_MESSAGE = "We could not remove that. Try again.";
export const RELOAD_MESSAGE = "Reload the page and try again.";

// ---------------------------------------------------------------------------------------------------------------
// Photos and the save bar
// ---------------------------------------------------------------------------------------------------------------

export const PHOTO_LIMIT_MESSAGE = `You can add up to ${MAX_PHOTOS} photos. Remove one to add another.`;
export const IMAGE_GONE_MESSAGE = "That image has already been removed. Reload the page to see the latest.";

/**
 * How many of `chosen` files fit, and which are turned away with what message. A logo is one at a time; photos fill the
 * slots left under the limit of 20. The server checks the limit again under a lock.
 */
export function planUpload(purpose: "logo" | "photo", chosen: readonly File[], photoCount: number): { accepted: readonly File[]; turnedAway: readonly { file: File; message: string }[] } {
  const room = purpose === "logo" ? 1 : Math.max(0, MAX_PHOTOS - photoCount);
  const message = purpose === "logo" ? "Add one logo at a time." : `You can keep up to ${MAX_PHOTOS} photos, so this one was not added.`;
  return { accepted: chosen.slice(0, room), turnedAway: chosen.slice(room).map((file) => ({ file, message })) };
}

/**
 * A form's fields as one string, so "has anything changed" is a comparison of two strings (ported from
 * lib/details/form-snapshot.ts, which read a FormData; the sections here hold their values in state).
 */
export function formSnapshot(entries: Iterable<readonly [string, FormDataEntryValue]>): string {
  return JSON.stringify(Array.from(entries, ([name, entry]) => [name, typeof entry === "string" ? entry : entry.name]));
}

/** The values of a section form as the FormData an action reads. */
export function toFormData(values: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  for (const [name, entry] of Object.entries(values)) data.append(name, entry);
  return data;
}
