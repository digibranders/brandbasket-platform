import "server-only";
import { findSetupCallBooking, recordSetupCallBooking, withTenantScope } from "@fynix/db";
import type { TenantContext } from "@fynix/shared/lib/access";
import { readInviteeUri } from "@fynix/shared/lib/setup-call-link";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { getAppDb } from "./db";
import { BOOKING_WINDOW_DAYS, bookCallSlot, listCallSlots } from "./call-scheduling";
import { getSetupCallUrl } from "./setup-call-link";

/** What the home screen needs to show the kickoff call: where it is booked, and whether and when it has been. */
export interface SetupCallState {
  /** The booking page staff set in the console, or null when there is none. */
  readonly url: string | null;
  readonly booking: SetupCallBookingView | null;
  /** The server's clock when this was read, for the "Paid 2 h ago" badge's first draw (a page may not read the clock itself). */
  readonly readAtMs: number;
}

/** A booking as the page shows it. Dates are ISO text so the card, a client component, can take them as they are. */
export interface SetupCallBookingView {
  readonly bookedAtIso: string;
  /** The meeting's time, once the booking page has reported it; null until then. */
  readonly startsAtIso: string | null;
  readonly endsAtIso: string | null;
}

/**
 * The call link and the business's booking, for the home screen. Neither is allowed to break the page: a failure to read
 * the booking is logged and treated as "not booked yet", and the link has its own guard (getSetupCallUrl).
 */
export async function getSetupCallState(tenant: TenantContext): Promise<SetupCallState> {
  const url = await getSetupCallUrl();
  const readAtMs = Date.now();
  try {
    const row = await withTenantScope(getAppDb(), tenant, (tx) => findSetupCallBooking(tx, tenant.businessId));
    if (row === null) return { url, booking: null, readAtMs };
    return {
      url,
      readAtMs,
      booking: {
        bookedAtIso: row.bookedAt.toISOString(),
        startsAtIso: row.startsAt?.toISOString() ?? null,
        endsAtIso: row.endsAt?.toISOString() ?? null,
      },
    };
  } catch (error) {
    console.error("[setup-call] could not read the booking", errorLogInfo(error));
    return { url, booking: null, readAtMs };
  }
}

/**
 * Notes that the business booked its kickoff call, when its booking page says a time was picked. The booking link comes
 * from the browser, so it is checked (readInviteeUri) and an unusable one is simply not stored; the business comes from
 * the session, never from the request.
 */
export async function markSetupCallBooked(tenant: TenantContext, inviteeUri: unknown, now: Date): Promise<void> {
  await withTenantScope(getAppDb(), tenant, (tx) =>
    recordSetupCallBooking(tx, { businessId: tenant.businessId, inviteeUri: readInviteeUri(inviteeUri), now }),
  );
}

/** The times a customer can pick for the call: `unavailable` when none can be offered here, and the booking page is shown instead. */
export type SetupCallSlots = { readonly status: "ok"; readonly slots: readonly string[] } | { readonly status: "unavailable" };

export async function loadSetupCallSlots(now: Date): Promise<SetupCallSlots> {
  try {
    const url = await getSetupCallUrl();
    const slots = url === null ? null : await listCallSlots(url, now);
    return slots === null ? { status: "unavailable" } : { status: "ok", slots };
  } catch (error) {
    console.error("[setup-call] could not load the times", errorLogInfo(error));
    return { status: "unavailable" };
  }
}

export type BookSetupCallResult =
  | { readonly ok: true; readonly startsAtIso: string; readonly endsAtIso: string }
  | { readonly ok: false; readonly reason: "taken" | "failed" };

/**
 * Books the time the customer picked and notes it with its time, so the home screen can say when the call is. The time must
 * be one still ahead and inside the booking window; whether it is really free is the booking service's answer.
 */
export async function bookSetupCall(
  tenant: TenantContext,
  invitee: { readonly name: string; readonly email: string },
  startIso: unknown,
  timeZone: unknown,
  now: Date,
): Promise<BookSetupCallResult> {
  const start = typeof startIso === "string" ? new Date(startIso) : null;
  const zone = typeof timeZone === "string" && timeZone.length <= 64 && isTimeZone(timeZone) ? timeZone : "UTC";
  if (start === null || Number.isNaN(start.getTime()) || start <= now || start.getTime() > now.getTime() + BOOKING_WINDOW_DAYS * 86_400_000) {
    return { ok: false, reason: "failed" };
  }
  try {
    const url = await getSetupCallUrl();
    const result = url === null ? null : await bookCallSlot(url, start.toISOString(), { ...invitee, timeZone: zone, businessId: tenant.businessId });
    if (result === null || !result.ok) return result ?? { ok: false, reason: "failed" };
    await withTenantScope(getAppDb(), tenant, (tx) =>
      recordSetupCallBooking(tx, {
        businessId: tenant.businessId,
        inviteeUri: readInviteeUri(result.call.inviteeUri),
        now,
        startsAt: result.call.startsAt,
        endsAt: result.call.endsAt,
      }),
    );
    return { ok: true, startsAtIso: result.call.startsAt.toISOString(), endsAtIso: result.call.endsAt.toISOString() };
  } catch (error) {
    console.error("[setup-call] could not book the call", errorLogInfo(error));
    return { ok: false, reason: "failed" };
  }
}

function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
