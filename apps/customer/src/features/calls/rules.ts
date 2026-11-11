import { isCallReason, MAX_CALL_NOTE_LENGTH, type CallReason, type CallStatus } from "@brandbasket/db/call-reasons";
import { dayKey, groupSlotsByDay } from "@brandbasket/shared/lib/call-slots";
import { addWorkingDays } from "@brandbasket/shared/lib/working-days";
import { z } from "zod";
import { APP_TIME_ZONE, formatDate, formatDateTime, formatTime } from "@/lib/format";
import type { Service } from "@/lib/guard-rules";

/*
 * The rules of calls as pure functions: which times can be picked, the booking service's link and metadata, the Help page's
 * rows, the Book a call form, and when calls are open. Ported from apps/platform lib/server/call-scheduling.ts (the pure
 * parts), lib/calls/{rows,form,slot-view,alert-facts}.ts, lib/call-dates.ts and lib/first-look.ts, with their tests. Times
 * are written by @/lib/format (24-hour, India time), so "2:00 pm" in the old app reads "14:00" here.
 */

// ---- Times that can be picked ----

/** How far ahead a time can be picked. */
export const BOOKING_WINDOW_DAYS = 28;
const DAY_MS = 86_400_000;

/** The time a browser sent as a slot, if it is a real time still ahead and inside the booking window; null otherwise. */
export function readSlotStart(value: unknown, now: Date): Date | null {
  const start = typeof value === "string" ? new Date(value) : null;
  if (start === null || Number.isNaN(start.getTime()) || start <= now || start.getTime() > now.getTime() + BOOKING_WINDOW_DAYS * DAY_MS) return null;
  return start;
}

/** The time zone a browser sent, or UTC when it is not one the runtime knows. */
export function readTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.length > 64) return "UTC";
  try {
    // eslint-disable-next-line no-restricted-properties -- checks the zone name is one the runtime knows; nothing is formatted for reading.
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

/** The window the booking service is asked for: from a minute from now to the end of the booking window. */
export function slotWindow(now: Date): { readonly from: Date; readonly to: Date } {
  return { from: new Date(now.getTime() + 60_000), to: new Date(now.getTime() + BOOKING_WINDOW_DAYS * DAY_MS) };
}

// ---- Cal.com ----

/** Who is booking, as the booking service needs to know. */
export interface CallInvitee {
  readonly name: string;
  readonly email: string;
  readonly timeZone: string;
  /** Sent with the booking so the service's own records can be matched back to the business. */
  readonly businessId: string;
  /** What the booking is for. A booking made without one is the kickoff call. */
  readonly purpose?: "kickoff" | "call";
  readonly reason?: CallReason;
  readonly note?: string | null;
}

/** Cal.com keeps a metadata value up to 500 characters. */
const CALCOM_METADATA_VALUE_LIMIT = 500;

/**
 * What the app writes into a Cal.com booking's metadata. The webhook in apps/platform reads it back (BOOKING_CREATED) to tell
 * the kickoff call from a later call; a booking with no purpose is the kickoff.
 */
export function calcomBookingMetadata(invitee: CallInvitee): Record<string, string> {
  return {
    source: "dashboard",
    businessId: invitee.businessId,
    purpose: invitee.purpose ?? "kickoff",
    ...(invitee.reason === undefined ? {} : { reason: invitee.reason }),
    ...(invitee.note === undefined || invitee.note === null || invitee.note === "" ? {} : { note: invitee.note.slice(0, CALCOM_METADATA_VALUE_LIMIT) }),
  };
}

/** The host and event a Cal.com booking link points at, or null when the link is not a plain cal.com/<user>/<event> one. */
export function calcomPage(bookingUrl: string): { readonly username: string; readonly slug: string } | null {
  let url: URL;
  try {
    url = new URL(bookingUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || (url.hostname !== "cal.com" && url.hostname !== "www.cal.com")) return null;
  const [username, slug, ...rest] = url.pathname.split("/").filter((part) => part !== "");
  return username === undefined || slug === undefined || rest.length > 0 ? null : { username, slug };
}

export const CALCOM_API = "https://api.cal.com/v2";
/** The form a Cal.com booking is stored in; only a booking this app made has it, so only that is ever cancelled. */
const CALCOM_BOOKING_URI = /^https:\/\/api\.cal\.com\/v2\/bookings\/([A-Za-z0-9_-]{1,64})$/;

/** The address a Cal.com booking is stored under: the API's own address for it, by its uid. */
export function calcomBookingUri(uid: string): string {
  return `${CALCOM_API}/bookings/${uid}`;
}

/** The uid of a Cal.com booking this app stored, or null for anything else (a Calendly link, a link a browser reported). */
export function calcomBookingUid(uri: string): string | null {
  return CALCOM_BOOKING_URI.exec(uri)?.[1] ?? null;
}

/** Cal.com says a time is gone with a conflict, or a bad request that names the host as unavailable or already booked. */
export function calcomSaysTaken(status: number, detail: string): boolean {
  return status === 409 || (status === 400 && /available|already|busy|conflict/i.test(detail));
}

/** The https address of the meeting a Cal.com booking made, from its own field or its location; null when it has none. */
export function calcomMeetingUrl(data: { readonly meetingUrl?: string | null | undefined; readonly location?: string | null | undefined }): string | null {
  return [data.meetingUrl, data.location].find((value): value is string => typeof value === "string" && value.startsWith("https://")) ?? null;
}

// ---- The local stand-in scheduler ----

const FAKE_UTC_TIMES: readonly (readonly [number, number])[] = [[4, 30], [5, 30], [7, 0], [9, 30], [11, 0]];
export const FAKE_DURATION_MS = 30 * 60_000;

/** Weekday times so the screens can be used with no booking account. Never used where real customers can reach the app. */
export function fakeSlots(from: Date, to: Date): readonly string[] {
  const slots: string[] = [];
  const first = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  for (let day = first; day <= to.getTime(); day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const [hour, minute] of FAKE_UTC_TIMES) {
      const start = day + (hour * 60 + minute) * 60_000;
      if (start >= from.getTime() && start <= to.getTime()) slots.push(new Date(start).toISOString());
    }
  }
  return slots;
}

// ---- Promises on screen ----

/** We start within 48 hours of the kickoff call. */
const START_WITHIN_HOURS = 48;
/** The website's promise: live within 7 working days of the call. */
const LIVE_WITHIN_WORKING_DAYS = 7;

/** The two dates the kickoff promises, as `YYYY-MM-DD` in India. */
export function promiseDates(callStartIso: string): { readonly startBy: string; readonly liveBy: string } {
  const startBy = dayKey(new Date(Date.parse(callStartIso) + START_WITHIN_HOURS * 3_600_000).toISOString(), APP_TIME_ZONE);
  return { startBy, liveBy: addWorkingDays(dayKey(callStartIso, APP_TIME_ZONE), LIVE_WITHIN_WORKING_DAYS) };
}

/** "Thu 5 Nov" for an India day (`YYYY-MM-DD`). */
export function dayLabel(day: string, now: Date = new Date()): string {
  return formatDate(new Date(`${day}T12:00:00+05:30`), now);
}

/** "Wed 2 Dec, 14:00" for a slot's start, in India. */
export function slotLabel(iso: string, now: Date = new Date()): string {
  return formatDateTime(new Date(iso), now);
}

/** The slots grouped by India day, each day's times in order. */
export function slotDays(slots: readonly string[]): ReadonlyMap<string, readonly string[]> {
  return groupSlotsByDay(slots, APP_TIME_ZONE);
}

/** The words on the Book button: the answer to "what happens if I press it". */
export function bookButtonLabel(slot: string | null, booking: boolean, now: Date = new Date()): string {
  if (booking) return "Booking…";
  return slot === null ? "Pick a time" : `Book ${slotLabel(slot, now)}`;
}

// ---- What a call is about ----

export const CALL_REASON_LABELS: Readonly<Record<CallReason, string>> = {
  website: "Website",
  social: "Social & Ads",
  search: "Local SEO + AEO",
  billing: "Billing",
  other: "Something else",
};

const REASON_ORDER: readonly CallReason[] = ["website", "social", "search", "billing", "other"];
const SERVICE_REASONS: readonly CallReason[] = ["website", "social", "search"];

export interface ReasonOption {
  readonly value: CallReason;
  readonly label: string;
}

/** What a call can be about: the services the customer bought, then Billing and Something else. */
export function reasonOptions(services: readonly Service[]): readonly ReasonOption[] {
  return REASON_ORDER.filter((reason) => !SERVICE_REASONS.includes(reason) || services.includes(reason as Service)).map((value) => ({ value, label: CALL_REASON_LABELS[value] }));
}

/** The reason the dialog starts on: the one it was opened with if this customer may pick it, else the first option. */
export function defaultReasonOf(options: readonly { readonly value: CallReason }[], wanted: CallReason | undefined): CallReason | undefined {
  return options.find((option) => option.value === wanted)?.value ?? options[0]?.value;
}

export const REASON_MESSAGE = "Choose what the call is about.";
export const NOTE_MESSAGE = `Keep the note to ${MAX_CALL_NOTE_LENGTH} characters or fewer.`;

export type BookCallRead = { readonly ok: true; readonly reason: CallReason; readonly note: string | null } | { readonly ok: false; readonly message: string };

/**
 * Reads what the Book a call dialog sends. `allowed` is the reasons this customer may pick (reasonOptions), so a service they
 * do not have is refused even if the browser sends it. Every message here reaches the customer.
 */
export function readBookCall(input: { readonly reason: unknown; readonly note: unknown }, allowed: readonly CallReason[]): BookCallRead {
  if (!isCallReason(input.reason) || !allowed.includes(input.reason)) return { ok: false, message: REASON_MESSAGE };
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") return { ok: false, message: NOTE_MESSAGE };
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > MAX_CALL_NOTE_LENGTH) return { ok: false, message: NOTE_MESSAGE };
  return { ok: true, reason: input.reason, note: note === "" ? null : note };
}

/** The shape of a booking request; the reason and note are read by readBookCall against what this customer may pick. */
export const bookCallInput = z.object({
  startIso: z.string().max(64),
  timeZone: z.string().max(64).optional(),
  reason: z.unknown(),
  note: z.unknown(),
  replaceId: z.uuid().nullable().optional(),
});

/** A call id from the browser, before it is looked up under the customer's own business. */
export const callIdInput = z.uuid();

// ---- Booking outcomes ----

export type BookProblem = "taken" | "failed" | "limit" | "no_email";

/** How many calls a business may have booked at once, so one account cannot fill the team's calendar. */
export const MAX_UPCOMING_CALLS = 3;

/** Shown to a viewer, who can read calls but not book or change them. The database refuses their writes too. */
export const VIEWER_MESSAGE = "Only the owner or an editor can change this.";
/** Until the kickoff is over the kickoff is the only call. */
export const CALLS_CLOSED_MESSAGE = "Calls open after your kickoff call.";

export const BOOK_PROBLEM_TEXT: Readonly<Record<BookProblem, string>> = {
  taken: "That time was just taken. Please pick another.",
  failed: "We could not book that time. Please try again.",
  limit: `You already have ${String(MAX_UPCOMING_CALLS)} calls booked. Change or cancel one first.`,
  no_email: "Add an email address in Settings to book here.",
};

// ---- The Help page's rows ----

/** A call after the kickoff, as the rules need it (a row of `team_calls`). */
export interface CallInput {
  readonly id: string;
  readonly reason: CallReason;
  readonly note: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: CallStatus;
  readonly summary: string | null;
}

/** The kickoff call (a row of `setup_call_bookings`). */
export interface KickoffInput {
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly heldAt: Date | null;
  readonly summary: string | null;
}

/** One line of the Help page's calls. */
export interface CallRow {
  /** The call's id, or "kickoff". */
  readonly key: string;
  /** The `team_calls` id, or null for the kickoff, which is changed from Home, not here. */
  readonly callId: string | null;
  /** "Kickoff", or the reason in the customer's words. */
  readonly about: string;
  /** Kept so changing the call's time starts from them. Null for the kickoff. */
  readonly reason: CallReason | null;
  readonly note: string | null;
  /** "Wed 2 Dec, 14:00", in India. */
  readonly when: string;
  readonly startsAtIso: string;
  readonly endsAtIso: string;
  /** What staff wrote about what was agreed. Only a held call has it. */
  readonly agreed: string | null;
  readonly canChange: boolean;
  readonly canCancel: boolean;
}

interface RowParts {
  readonly key: string;
  readonly callId: string | null;
  readonly about: string;
  readonly reason: CallReason | null;
  readonly note: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly agreed: string | null;
  readonly editable: boolean;
}

function rowOf(parts: RowParts, now: Date): CallRow {
  const ahead = parts.editable && parts.startsAt > now;
  return {
    key: parts.key,
    callId: parts.callId,
    about: parts.about,
    reason: parts.reason,
    note: parts.note,
    when: slotLabel(parts.startsAt.toISOString(), now),
    startsAtIso: parts.startsAt.toISOString(),
    endsAtIso: parts.endsAt.toISOString(),
    agreed: parts.agreed,
    canChange: ahead,
    canCancel: ahead,
  };
}

/**
 * The two lists of calls. A call is upcoming until it has ended, unless staff marked it held; a cancelled call is not shown.
 * Upcoming is soonest first, past is newest first. The kickoff is one more row when it has both times; it is never changed
 * or cancelled here.
 */
export function callRows(input: { readonly calls: readonly CallInput[]; readonly kickoff: KickoffInput | null; readonly now: Date }): { readonly upcoming: readonly CallRow[]; readonly past: readonly CallRow[] } {
  const upcoming: CallRow[] = [];
  const past: CallRow[] = [];
  for (const call of input.calls) {
    if (call.status === "cancelled") continue;
    const row = rowOf(
      {
        key: call.id,
        callId: call.id,
        about: CALL_REASON_LABELS[call.reason],
        reason: call.reason,
        note: call.note,
        startsAt: call.startsAt,
        endsAt: call.endsAt,
        agreed: call.status === "held" ? call.summary : null,
        editable: call.status === "booked",
      },
      input.now,
    );
    (call.status === "booked" && call.endsAt > input.now ? upcoming : past).push(row);
  }
  const kickoff = input.kickoff;
  if (kickoff !== null && kickoff.startsAt !== null && kickoff.endsAt !== null) {
    const row = rowOf(
      { key: "kickoff", callId: null, about: "Kickoff", reason: null, note: null, startsAt: kickoff.startsAt, endsAt: kickoff.endsAt, agreed: kickoff.heldAt === null ? null : kickoff.summary, editable: false },
      input.now,
    );
    (kickoff.heldAt === null && kickoff.endsAt > input.now ? upcoming : past).push(row);
  }
  upcoming.sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso));
  past.sort((a, b) => b.startsAtIso.localeCompare(a.startsAtIso));
  return { upcoming, past };
}

/** Booked calls that have not ended, optionally leaving out the one being changed. The limit counts these. */
export function upcomingCount(calls: readonly Pick<CallInput, "id" | "status" | "endsAt">[], now: Date, exceptId?: string): number {
  return calls.filter((call) => call.status === "booked" && call.endsAt > now && call.id !== exceptId).length;
}

/** The soonest call still to come, or null when none is booked. */
export function nextCall(upcoming: readonly CallRow[]): CallRow | null {
  return upcoming[0] ?? null;
}

// ---- When calls are open ----

/** How long after a call's end time the first look stays open when staff have not marked it held. */
const HELD_GRACE_MS = 2 * 24 * 3_600_000;

export interface FirstLookInput {
  readonly hasAccess: boolean;
  readonly websiteLive: boolean;
  /** The website details were sent (projects.onboarding_submitted_at). */
  readonly setupSent: boolean;
  readonly callHeld: boolean;
  readonly callEndsAt: Date | null;
  readonly now: Date;
}

/**
 * Whether the account is still in its first look: it has paid, the website has not been sent or launched, and the kickoff
 * call has not been held. If nobody marks the call held, the first look ends two days after the call's end time. A booked
 * call with no end time keeps it open until staff mark it or the website is sent. An account that has not paid, or has
 * lapsed, never gets it. Note: this 2-day window differs from the 24 hour kickoff auto start in apps/platform
 * (packages/db kickoff-build.ts, KICKOFF_FALLBACK_START_HOURS); both are kept as they are.
 */
export function inFirstLook(input: FirstLookInput): boolean {
  if (!input.hasAccess) return false;
  if (input.websiteLive || input.setupSent || input.callHeld) return false;
  return input.callEndsAt === null || input.callEndsAt.getTime() + HELD_GRACE_MS > input.now.getTime();
}

/** Calls after the kickoff (book, change, cancel, the calls list) are open once the account has paid and the first look is over. */
export function callsAreOpen(input: FirstLookInput): boolean {
  return input.hasAccess && !inFirstLook(input);
}

// ---- The staff alert ----

/** What a call is about, as staff read it in the alert: the same words as the console's calls list. */
const ALERT_REASON_NAMES: Readonly<Record<CallReason, string>> = {
  website: "Website",
  social: "Social & Ads",
  search: "Search",
  billing: "Billing",
  other: "Something else",
};

/** "Wed 28 Oct, 15:30 to 16:00 India time": the staff team works in India time, whatever zone the customer booked in. */
export function callTimeText(startsAt: Date, endsAt: Date): string {
  return `${formatDateTime(startsAt, startsAt)} to ${formatTime(endsAt)} India time`;
}

/** "A", "A and B", "A, B and C". */
export function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

export interface CallAlertInput {
  readonly kind: "kickoff" | "call";
  readonly changed: boolean;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly previousStartsAt: Date | null;
  readonly previousEndsAt: Date | null;
  /** The services the plan pays for, by name. */
  readonly services: readonly string[];
  readonly meetingUrl: string | null;
  readonly reason: CallReason | null;
  readonly note: string | null;
}

/** The facts, text and buttons of the call alert. Empty values are left out by the card. */
export function callAlert(input: CallAlertInput): {
  readonly event: "kickoff_booked" | "kickoff_changed" | "call_booked" | "call_changed";
  readonly facts: readonly { readonly name: string; readonly value: string | null }[];
  readonly text: string | null;
  readonly buttons: readonly { readonly label: string; readonly url: string }[];
} {
  const event = `${input.kind}_${input.changed ? "changed" : "booked"}` as const;
  const wasAt = input.previousStartsAt === null || input.previousEndsAt === null ? null : callTimeText(input.previousStartsAt, input.previousEndsAt);
  const services = andList(input.services);
  return {
    event,
    facts: [
      { name: "When", value: callTimeText(input.startsAt, input.endsAt) },
      { name: "Moved from", value: input.changed ? wasAt : null },
      { name: "About", value: input.reason === null ? null : ALERT_REASON_NAMES[input.reason] },
      { name: "Services", value: services === "" ? null : services },
      { name: "Meeting link", value: input.meetingUrl },
    ],
    text: input.note === null || input.note.trim() === "" ? null : `Customer's note: ${input.note.trim()}`,
    buttons: input.meetingUrl === null ? [] : [{ label: "Join meeting", url: input.meetingUrl }],
  };
}
