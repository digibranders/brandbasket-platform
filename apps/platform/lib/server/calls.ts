import "server-only";
import { cancelTeamCall, findTeamCall, isPhoneAccountEmail, listTeamCalls, recordTeamCall, withTenantScope } from "@brandbasket/db";
import type { CallReason } from "@brandbasket/db/call-reasons";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import type { CustomerBilling } from "@brandbasket/shared/lib/billing/status";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import type { BookCallOptions } from "@/lib/calls/form";
import { callRows, MAX_UPCOMING_CALLS, nextCallLine, upcomingCount, type CallRow } from "@/lib/calls/rows";
import { firstLookInput, inFirstLook } from "@/lib/first-look";
import { kindOptions } from "@/lib/requests/form";
import { announceCallBooked } from "./call-alert";
import { bookCallSlot, cancelCallBooking, readSlotStart, readTimeZone } from "./call-scheduling";
import { getAppDb } from "./db";
import { loadSetupServices } from "./first-look";
import { getLiveWebsite, getProjectOverview } from "./onboarding";
import { quietly } from "./quietly";
import { getSetupCallState } from "./setup-call";
import { getSetupCallUrl } from "./setup-call-link";

/** What the Calls page draws. */
export interface CallsData {
  readonly upcoming: readonly CallRow[];
  readonly past: readonly CallRow[];
}

const dateOf = (iso: string | null): Date | null => (iso === null ? null : new Date(iso));

/**
 * The calls of the signed-in business, kickoff included, as the Calls page shows them. Throws when the calls cannot be read:
 * the page says so rather than showing an empty list that looks like having no calls.
 */
export async function loadCalls(tenant: TenantContext, now: Date): Promise<CallsData> {
  const [calls, state] = await Promise.all([withTenantScope(getAppDb(), tenant, (tx) => listTeamCalls(tx, tenant.businessId)), getSetupCallState(tenant)]);
  const booking = state.booking;
  const kickoff = booking === null ? null : { startsAt: dateOf(booking.startsAtIso), endsAt: dateOf(booking.endsAtIso), heldAt: dateOf(booking.heldAtIso), summary: booking.summary };
  return callRows({ calls, kickoff, now });
}

/** The time of the next call after the kickoff, for Overview. A failed read shows none rather than taking Overview down. */
export async function loadNextCall(tenant: TenantContext, now: Date): Promise<string | null> {
  return quietly("calls", "the next call", null as string | null, async () => {
    const calls = await withTenantScope(getAppDb(), tenant, (tx) => listTeamCalls(tx, tenant.businessId));
    return nextCallLine(callRows({ calls, kickoff: null, now }).upcoming);
  });
}

/**
 * Whether the customer can book and change calls: the account has paid and the first look is over (plan 28 section 7: after
 * the kickoff there is one kind of call; until then the kickoff is the only call). The same test as the rail's quiet mode.
 */
export async function callsAreOpen(tenant: TenantContext, billing: CustomerBilling): Promise<boolean> {
  if (!billing.hasAccess) return false;
  const [overview, liveWebsite, callState] = await Promise.all([getProjectOverview(), getLiveWebsite(), getSetupCallState(tenant)]);
  return !inFirstLook(firstLookInput({ hasAccess: billing.hasAccess, liveWebsite, project: overview.project, callState }));
}

/**
 * What Requests and the open request need to offer Book a call, or null when it is not offered: the account has not paid, the
 * first look is not over, or there is no booking link to book through. A failed read offers nothing rather than taking the
 * page down.
 */
export async function loadBookCallOptions(tenant: TenantContext, billing: CustomerBilling, email: string): Promise<BookCallOptions | null> {
  return quietly("calls", "the Book a call options", null as BookCallOptions | null, async () => {
    if (!(await callsAreOpen(tenant, billing))) return null;
    const [services, callState] = await Promise.all([loadSetupServices(tenant), getSetupCallState(tenant)]);
    if (callState.url === null) return null;
    return { options: kindOptions(services ?? []), bookingUrl: callState.url, canBook: !isPhoneAccountEmail(email) };
  });
}

export type BookTeamCallResult =
  | { readonly ok: true; readonly startsAtIso: string; readonly endsAtIso: string }
  | { readonly ok: false; readonly reason: "taken" | "failed" | "limit" };

export interface BookTeamCallInput {
  readonly startIso: unknown;
  readonly timeZone: unknown;
  readonly reason: CallReason;
  readonly note: string | null;
  /** The call this one replaces (the customer is changing its time), or null. */
  readonly replaceId: string | null;
}

/**
 * Books the time the customer picked, tells Cal.com it is a call and why, and records it. The time must be one still ahead
 * and inside the booking window; whether it is really free is Cal.com's answer. A business may have three calls booked at
 * once. When a call is being changed, the new time is booked first and the old booking cancelled once it is made, never
 * before, so a customer is never left with no call.
 */
export async function bookTeamCall(
  tenant: TenantContext,
  invitee: { readonly name: string; readonly email: string },
  input: BookTeamCallInput,
  now: Date,
): Promise<BookTeamCallResult> {
  const start = readSlotStart(input.startIso, now);
  if (start === null) return { ok: false, reason: "failed" };
  try {
    const url = await getSetupCallUrl();
    if (url === null) return { ok: false, reason: "failed" };
    const existing = await withTenantScope(getAppDb(), tenant, (tx) => listTeamCalls(tx, tenant.businessId));
    const previous = input.replaceId === null ? null : (existing.find((call) => call.id === input.replaceId && call.status === "booked" && call.startsAt > now) ?? null);
    if (input.replaceId !== null && previous === null) return { ok: false, reason: "failed" };
    if (upcomingCount(existing, now, previous?.id) >= MAX_UPCOMING_CALLS) return { ok: false, reason: "limit" };

    const result = await bookCallSlot(url, start.toISOString(), {
      ...invitee,
      timeZone: readTimeZone(input.timeZone),
      businessId: tenant.businessId,
      purpose: "call",
      reason: input.reason,
      note: input.note,
    });
    if (result === null) return { ok: false, reason: "failed" };
    if (!result.ok) return { ok: false, reason: result.reason };

    try {
      await withTenantScope(getAppDb(), tenant, (tx) =>
        recordTeamCall(tx, {
          businessId: tenant.businessId,
          reason: input.reason,
          note: input.note,
          // The booking service's own answer, not something from the browser.
          startsAt: result.call.startsAt,
          endsAt: result.call.endsAt,
          providerUri: result.call.inviteeUri,
        }),
      );
    } catch (error) {
      console.error("[calls] could not record the call; cancelling its booking", errorLogInfo(error));
      if (result.call.inviteeUri !== null) await cancelCallBooking(url, result.call.inviteeUri).catch(() => undefined);
      return { ok: false, reason: "failed" };
    }

    if (previous !== null) {
      if (previous.providerUri !== null) {
        await cancelCallBooking(url, previous.providerUri).catch((error: unknown) => {
          console.error("[calls] could not cancel the earlier booking", errorLogInfo(error));
        });
      }
      await withTenantScope(getAppDb(), tenant, (tx) => cancelTeamCall(tx, { id: previous.id, businessId: tenant.businessId, now }));
    }
    void announceCallBooked({
      tenant,
      kind: "call",
      startsAt: result.call.startsAt,
      endsAt: result.call.endsAt,
      replaced: previous === null ? null : { startsAt: previous.startsAt, endsAt: previous.endsAt },
      meetingUrl: result.call.meetingUrl,
      reason: input.reason,
      note: input.note,
    });
    return { ok: true, startsAtIso: result.call.startsAt.toISOString(), endsAtIso: result.call.endsAt.toISOString() };
  } catch (error) {
    console.error("[calls] could not book the call", errorLogInfo(error));
    return { ok: false, reason: "failed" };
  }
}

export type CancelTeamCallResult = { readonly ok: true } | { readonly ok: false; readonly reason: "gone" | "failed" };

/**
 * Cancels a call that has not started: the booking with Cal.com first, so a call that is still on the host's calendar is
 * never shown as cancelled, then the call. `gone` is a call that is not there, is cancelled, or has started; a call that
 * Cal.com's webhook cancelled while this ran counts as cancelled by this.
 */
export async function cancelTeamCallFor(tenant: TenantContext, callId: string, now: Date): Promise<CancelTeamCallResult> {
  try {
    const call = await withTenantScope(getAppDb(), tenant, (tx) => findTeamCall(tx, tenant.businessId, callId));
    if (call === null || call.status !== "booked" || call.startsAt <= now) return { ok: false, reason: "gone" };
    if (call.providerUri !== null) {
      const url = await getSetupCallUrl();
      if (url !== null) await cancelCallBooking(url, call.providerUri);
    }
    const cancelled = await withTenantScope(getAppDb(), tenant, (tx) => cancelTeamCall(tx, { id: call.id, businessId: tenant.businessId, now }));
    if (cancelled) return { ok: true };
    // Cal.com's own cancellation webhook can mark the call cancelled between our Cal.com request and this update.
    const latest = await withTenantScope(getAppDb(), tenant, (tx) => findTeamCall(tx, tenant.businessId, callId));
    return latest?.status === "cancelled" ? { ok: true } : { ok: false, reason: "gone" };
  } catch (error) {
    console.error("[calls] could not cancel the call", errorLogInfo(error));
    return { ok: false, reason: "failed" };
  }
}
