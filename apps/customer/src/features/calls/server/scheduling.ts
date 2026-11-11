import "server-only";
import { isRealDeployment } from "@brandbasket/billing";
import { isCalendlyUrl } from "@brandbasket/shared/lib/setup-call-link";
import { z } from "zod";
import { reportError } from "@/lib/report";
import {
  calcomBookingMetadata,
  calcomBookingUid,
  calcomBookingUri,
  calcomMeetingUrl,
  calcomPage,
  calcomSaysTaken,
  CALCOM_API,
  FAKE_DURATION_MS,
  fakeSlots,
  slotWindow,
  type CallInvitee,
} from "../rules";

/*
 * The booking services: Cal.com, Calendly, and the local stand-in. Ported from apps/platform lib/server/call-scheduling.ts
 * (the pure parts are in ../rules.ts). Cal.com's webhook stays in apps/platform.
 */

export interface BookedCall {
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The service's link for this booking, or null when the service has none. */
  readonly inviteeUri: string | null;
  /** The video meeting's address, when the service reports one at booking time (Cal.com does); null otherwise. */
  readonly meetingUrl: string | null;
}

export type BookResult = { readonly ok: true; readonly call: BookedCall } | { readonly ok: false; readonly reason: "taken" | "failed" };

interface CallScheduler {
  slots(from: Date, to: Date): Promise<readonly string[]>;
  book(startIso: string, invitee: CallInvitee): Promise<BookResult>;
}

const REQUEST_TIMEOUT_MS = 8000;
const DAY_MS = 86_400_000;

// ---- Calendly ----

const CALENDLY_API = "https://api.calendly.com";
/** The longest span Calendly answers an availability request for is a week. */
const CALENDLY_SPAN_MS = 7 * DAY_MS - 60_000;
/** Meeting places Calendly can fill in itself; any other kind needs details we do not hold, so it is left out. */
const AUTOMATIC_LOCATION = /_conference$/;

const userSchema = z.object({ resource: z.object({ uri: z.string() }) });
const eventTypesSchema = z.object({
  collection: z.array(z.object({ uri: z.string(), scheduling_url: z.string(), duration: z.number().positive(), locations: z.array(z.object({ kind: z.string() })).nullish() })),
});
const availableTimesSchema = z.object({ collection: z.array(z.object({ status: z.string(), start_time: z.string() })) });
const inviteeSchema = z.object({ resource: z.object({ uri: z.string() }) });

type EventType = z.output<typeof eventTypesSchema>["collection"][number];

class CalendlyError extends Error {
  constructor(readonly status: number) {
    super(`Calendly answered ${String(status)}`);
    this.name = "CalendlyError";
  }
}

async function calendly<T>(token: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const response = await fetch(`${CALENDLY_API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new CalendlyError(response.status);
  return schema.parse(await response.json());
}

function pageKey(address: string): string {
  const url = new URL(address);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Looked up once per link and kept; a failed lookup is not kept, so the next visit tries again. */
const eventTypes = new Map<string, Promise<EventType>>();

function eventTypeFor(token: string, bookingUrl: string): Promise<EventType> {
  const key = pageKey(bookingUrl);
  const known = eventTypes.get(key);
  if (known !== undefined) return known;
  const lookup = (async (): Promise<EventType> => {
    const me = await calendly(token, "/users/me", userSchema);
    const types = await calendly(token, `/event_types?user=${encodeURIComponent(me.resource.uri)}&active=true&count=100`, eventTypesSchema);
    const match = types.collection.find((type) => pageKey(type.scheduling_url) === key);
    if (match === undefined) throw new Error("The booking link does not belong to the Calendly account the token is for");
    return match;
  })();
  eventTypes.set(key, lookup);
  lookup.catch(() => eventTypes.delete(key));
  return lookup;
}

function calendlyScheduler(token: string, bookingUrl: string): CallScheduler {
  return {
    async slots(from, to) {
      const type = await eventTypeFor(token, bookingUrl);
      const spans: { start: Date; end: Date }[] = [];
      for (let start = from.getTime(); start < to.getTime(); start += CALENDLY_SPAN_MS + 60_000) {
        spans.push({ start: new Date(start), end: new Date(Math.min(start + CALENDLY_SPAN_MS, to.getTime())) });
      }
      const weeks = await Promise.all(
        spans.map((span) =>
          calendly(
            token,
            `/event_type_available_times?event_type=${encodeURIComponent(type.uri)}&start_time=${encodeURIComponent(span.start.toISOString())}&end_time=${encodeURIComponent(span.end.toISOString())}`,
            availableTimesSchema,
          ),
        ),
      );
      return weeks.flatMap((week) => week.collection.filter((time) => time.status === "available").map((time) => time.start_time));
    },
    async book(startIso, invitee) {
      const type = await eventTypeFor(token, bookingUrl);
      const kind = type.locations?.[0]?.kind;
      try {
        const booked = await calendly(token, "/invitees", inviteeSchema, {
          event_type: type.uri,
          start_time: startIso,
          invitee: { name: invitee.name, email: invitee.email, timezone: invitee.timeZone },
          ...(kind !== undefined && AUTOMATIC_LOCATION.test(kind) ? { location: { kind } } : {}),
          tracking: { utm_source: "dashboard", utm_content: invitee.businessId },
        });
        const startsAt = new Date(startIso);
        return { ok: true, call: { startsAt, endsAt: new Date(startsAt.getTime() + type.duration * 60_000), inviteeUri: booked.resource.uri, meetingUrl: null } };
      } catch (error) {
        // Calendly answers a time that was taken a moment ago with a conflict.
        const taken = error instanceof CalendlyError && error.status === 409;
        if (!taken) reportError(error, { area: "calls.calendly-book" });
        return { ok: false, reason: taken ? "taken" : "failed" };
      }
    },
  };
}

// ---- Cal.com ----

const CALCOM_SLOTS_VERSION = "2024-09-04";
const CALCOM_BOOKINGS_VERSION = "2026-02-25";

const calcomSlotsSchema = z.object({ data: z.record(z.string(), z.array(z.object({ start: z.string() }))) });
const calcomBookingSchema = z.object({ data: z.object({ uid: z.string(), start: z.string(), end: z.string(), meetingUrl: z.string().nullish(), location: z.string().nullish() }) });
const calcomErrorSchema = z.object({ error: z.object({ message: z.string().optional() }).optional(), message: z.string().optional() });

class CalcomError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Cal.com answered ${String(status)}`);
    this.name = "CalcomError";
  }
}

async function calcom<T>(key: string, path: string, version: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const response = await fetch(`${CALCOM_API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${key}`, "cal-api-version": version, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    const problem = calcomErrorSchema.safeParse(await response.json().catch(() => null));
    throw new CalcomError(response.status, problem.success ? (problem.data.error?.message ?? problem.data.message ?? "") : "");
  }
  return schema.parse(await response.json());
}

const isTaken = (error: unknown): boolean => error instanceof CalcomError && calcomSaysTaken(error.status, error.detail);

function calcomScheduler(key: string, page: { readonly username: string; readonly slug: string }): CallScheduler {
  return {
    async slots(from, to) {
      const query = new URLSearchParams({ username: page.username, eventTypeSlug: page.slug, start: from.toISOString(), end: to.toISOString(), timeZone: "UTC" });
      const days = await calcom(key, `/slots?${query.toString()}`, CALCOM_SLOTS_VERSION, calcomSlotsSchema);
      return Object.values(days.data).flatMap((day) => day.map((slot) => new Date(slot.start).toISOString()));
    },
    async book(startIso, invitee) {
      try {
        const booked = await calcom(key, "/bookings", CALCOM_BOOKINGS_VERSION, calcomBookingSchema, {
          start: startIso,
          username: page.username,
          eventTypeSlug: page.slug,
          attendee: { name: invitee.name, email: invitee.email, timeZone: invitee.timeZone, language: "en" },
          metadata: calcomBookingMetadata(invitee),
        });
        return { ok: true, call: { startsAt: new Date(booked.data.start), endsAt: new Date(booked.data.end), inviteeUri: calcomBookingUri(booked.data.uid), meetingUrl: calcomMeetingUrl(booked.data) } };
      } catch (error) {
        if (!isTaken(error)) reportError(error, { area: "calls.calcom-book" });
        return { ok: false, reason: isTaken(error) ? "taken" : "failed" };
      }
    },
  };
}

// ---- The local stand-in, like the fake billing provider ----

const fakeScheduler: CallScheduler = {
  slots: (from, to) => Promise.resolve(fakeSlots(from, to)),
  book(startIso) {
    const startsAt = new Date(startIso);
    const window = slotWindow(new Date());
    if (!fakeSlots(new Date(), window.to).includes(startsAt.toISOString())) return Promise.resolve({ ok: false, reason: "taken" });
    return Promise.resolve({ ok: true, call: { startsAt, endsAt: new Date(startsAt.getTime() + FAKE_DURATION_MS), inviteeUri: null, meetingUrl: null } });
  },
};

const envValue = (name: string): string => process.env[name]?.trim() ?? "";

/** The scheduler for this deployment, or null when times cannot be offered here (the booking page is shown instead). */
function schedulerFor(bookingUrl: string): CallScheduler | null {
  const calcomKey = envValue("CALCOM_API_KEY");
  const page = calcomPage(bookingUrl);
  if (calcomKey !== "" && page !== null) return calcomScheduler(calcomKey, page);
  const token = envValue("CALENDLY_API_TOKEN");
  if (token !== "" && isCalendlyUrl(bookingUrl)) return calendlyScheduler(token, bookingUrl);
  return isRealDeployment({ VERCEL_ENV: process.env.VERCEL_ENV, APP_ORIGIN: process.env.APP_ORIGIN }) ? null : fakeScheduler;
}

/** Times that can be booked from a minute from now to the end of the booking window, or null when times are not offered. */
export async function listCallSlots(bookingUrl: string, now: Date): Promise<readonly string[] | null> {
  const scheduler = schedulerFor(bookingUrl);
  if (scheduler === null) return null;
  const window = slotWindow(now);
  return scheduler.slots(window.from, window.to);
}

/** Books a time; null when times are not offered here. The time is checked by the service, not trusted from the browser. */
export async function bookCallSlot(bookingUrl: string, startIso: string, invitee: CallInvitee): Promise<BookResult | null> {
  return schedulerFor(bookingUrl)?.book(startIso, invitee) ?? null;
}

/**
 * Cancels a booking. Only a Cal.com booking this app made can be cancelled; a Calendly one is left for the customer to cancel
 * from the email (shortcut: Calendly's cancel needs the event id, upgrade when Calendly is the main provider).
 */
export async function cancelCallBooking(bookingUrl: string, inviteeUri: string, reason = "The customer picked another time"): Promise<void> {
  const key = envValue("CALCOM_API_KEY");
  const uid = calcomBookingUid(inviteeUri);
  if (key === "" || uid === null || calcomPage(bookingUrl) === null) return;
  await calcom(key, `/bookings/${uid}/cancel`, CALCOM_BOOKINGS_VERSION, z.unknown(), { cancellationReason: reason });
}
