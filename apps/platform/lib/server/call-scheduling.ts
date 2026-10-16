import "server-only";
import { isRealDeployment } from "@fynix/billing";
import { z } from "zod";
import { isCalendlyUrl } from "@fynix/shared/lib/setup-call-link";

/** Who is booking, as the booking service needs to know. */
export interface CallInvitee {
  readonly name: string;
  readonly email: string;
  readonly timeZone: string;
  /** Sent with the booking so the service's own records can be matched back to the business. */
  readonly businessId: string;
}

export interface BookedCall {
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The service's link for this booking, or null when the service has none. */
  readonly inviteeUri: string | null;
}

export type BookResult = { readonly ok: true; readonly call: BookedCall } | { readonly ok: false; readonly reason: "taken" | "failed" };

interface CallScheduler {
  /** Start times (ISO) that can be booked between `from` and `to`. */
  slots(from: Date, to: Date): Promise<readonly string[]>;
  book(startIso: string, invitee: CallInvitee): Promise<BookResult>;
}

/** How far ahead a time can be picked. */
export const BOOKING_WINDOW_DAYS = 28;
const DAY_MS = 86_400_000;
const REQUEST_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------------------------------------------
// Calendly: the staff's real calendar, through its scheduling API (a paid Calendly plan, and CALENDLY_API_TOKEN). The
// event type is found from the booking link staff set in the console, so no second setting is needed.
// ---------------------------------------------------------------------------------------------------------------

const CALENDLY_API = "https://api.calendly.com";
/** The longest span Calendly answers an availability request for is a week. */
const CALENDLY_SPAN_MS = 7 * DAY_MS - 60_000;
/** Meeting places Calendly can fill in itself; any other kind needs details we do not hold, so it is left out. */
const AUTOMATIC_LOCATION = /_conference$/;

const userSchema = z.object({ resource: z.object({ uri: z.string() }) });
const eventTypesSchema = z.object({
  collection: z.array(
    z.object({
      uri: z.string(),
      scheduling_url: z.string(),
      duration: z.number().positive(),
      locations: z.array(z.object({ kind: z.string() })).nullish(),
    }),
  ),
});
const availableTimesSchema = z.object({ collection: z.array(z.object({ status: z.string(), start_time: z.string() })) });
const inviteeSchema = z.object({ resource: z.object({ uri: z.string() }) });

type EventType = z.output<typeof eventTypesSchema>["collection"][number];

class CalendlyError extends Error {
  constructor(readonly status: number) {
    super(`Calendly answered ${String(status)}`);
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
        return { ok: true, call: { startsAt, endsAt: new Date(startsAt.getTime() + type.duration * 60_000), inviteeUri: booked.resource.uri } };
      } catch (error) {
        // Calendly answers a time that was taken a moment ago with a conflict.
        return { ok: false, reason: error instanceof CalendlyError && error.status === 409 ? "taken" : "failed" };
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The local stand-in, like the fake billing provider: weekday times so the screen can be used with no Calendly account.
// It is never used where real customers can reach the app.
// ---------------------------------------------------------------------------------------------------------------

const FAKE_UTC_TIMES: readonly (readonly [number, number])[] = [[4, 30], [5, 30], [7, 0], [9, 30], [11, 0]];
const FAKE_DURATION_MS = 30 * 60_000;

function fakeSlots(from: Date, to: Date): readonly string[] {
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

const fakeScheduler: CallScheduler = {
  slots: (from, to) => Promise.resolve(fakeSlots(from, to)),
  book(startIso) {
    const startsAt = new Date(startIso);
    const now = new Date();
    if (!fakeSlots(now, new Date(now.getTime() + BOOKING_WINDOW_DAYS * DAY_MS)).includes(startsAt.toISOString())) {
      return Promise.resolve({ ok: false, reason: "taken" });
    }
    return Promise.resolve({ ok: true, call: { startsAt, endsAt: new Date(startsAt.getTime() + FAKE_DURATION_MS), inviteeUri: null } });
  },
};

/** The scheduler for this deployment, or null when times cannot be offered here (the booking page is shown instead). */
function schedulerFor(bookingUrl: string): CallScheduler | null {
  const token = process.env.CALENDLY_API_TOKEN?.trim();
  if (token !== undefined && token !== "" && isCalendlyUrl(bookingUrl)) return calendlyScheduler(token, bookingUrl);
  return isRealDeployment({ VERCEL_ENV: process.env.VERCEL_ENV, APP_ORIGIN: process.env.APP_ORIGIN }) ? null : fakeScheduler;
}

/** Times that can be booked from a minute from now to the end of the booking window, or null when times are not offered. */
export async function listCallSlots(bookingUrl: string, now: Date): Promise<readonly string[] | null> {
  const scheduler = schedulerFor(bookingUrl);
  if (scheduler === null) return null;
  return scheduler.slots(new Date(now.getTime() + 60_000), new Date(now.getTime() + BOOKING_WINDOW_DAYS * DAY_MS));
}

/** Books a time; null when times are not offered here. The time is checked by the service, not trusted from the browser. */
export async function bookCallSlot(bookingUrl: string, startIso: string, invitee: CallInvitee): Promise<BookResult | null> {
  return schedulerFor(bookingUrl)?.book(startIso, invitee) ?? null;
}
