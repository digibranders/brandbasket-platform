import "server-only";
import {
  cancelTeamCall,
  findLatestKickoffOutcome,
  findLatestProject,
  findOpenProject,
  getPrimaryDomain,
  findSetupCallBooking,
  findSiteSetting,
  findTeamCall,
  listTeamCalls,
  recordSetupCallBooking,
  recordTeamCall,
  withTenantScope,
  type Project,
  type SetupCallBooking,
  type TeamCall,
} from "@brandbasket/db";
import type { CallReason } from "@brandbasket/db/call-reasons";
import { readSetupCallUrl, SETUP_CALL_URL_KEY } from "@brandbasket/shared/lib/setup-call-link";
import { announceCustomerToTeams } from "@/features/checkout/server/teams";
import { getAppDb, getStaffDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { SERVICE_NAMES } from "@/ui";
import { callAlert, callsAreOpen, MAX_UPCOMING_CALLS, readSlotStart, readTimeZone, upcomingCount } from "../rules";
import { bookCallSlot, cancelCallBooking } from "./scheduling";


/*
 * The I/O of calls: the booking link staff set, the kickoff booking, calls after the kickoff, and the staff alert. Ported from
 * apps/platform lib/server/{setup-call,setup-call-link,missed-kickoff,calls,call-alert}.ts. The old readers logged a failure
 * and returned "no booking" or "no link"; here a read failure throws, so the caller's load() reports it and the screen shows
 * an error rather than "Book your kickoff" to someone who booked.
 */

/**
 * The booking page staff set in the console, or null when there is none or it is not a safe address (checked again here,
 * whatever was saved). Read on every request so a console edit shows at once.
 * Staff connection: site_settings is staff-only. Reads one fixed key and writes nothing (the same exception apps/platform
 * makes in lib/server/setup-call-link.ts; listed for src/lib/db.ts in the phase 4 report).
 */
export async function readBookingUrl(): Promise<string | null> {
  const setting = await findSiteSetting(getStaffDb(), SETUP_CALL_URL_KEY);
  if (setting === null) return null;
  const reading = readSetupCallUrl(setting.value);
  return reading.ok ? reading.url : null;
}

/** The business's kickoff booking, or null when none was made. Throws on a failed read. */
export async function readKickoffBooking(customer: CustomerContext): Promise<SetupCallBooking | null> {
  return withTenantScope(getAppDb(), customer.tenant, (tx) => findSetupCallBooking(tx, customer.businessId));
}

/**
 * When the kickoff staff marked as missed (the customer or the team did not attend) was due to start, or null when the latest
 * outcome says anything else or recorded no time. Call it only while the business has no booking.
 * Staff connection: customers cannot read setup_call_outcomes. The business id comes from the guard; it reads one row and
 * writes nothing (as apps/platform lib/server/missed-kickoff.ts; listed for src/lib/db.ts in the phase 4 report).
 */
export async function readMissedKickoffAt(customer: CustomerContext): Promise<Date | null> {
  const latest = await findLatestKickoffOutcome(getStaffDb(), customer.businessId);
  if (latest === null || (latest.outcome !== "customer_no_show" && latest.outcome !== "team_no_show")) return null;
  return latest.callStartsAt ?? latest.callEndsAt;
}

/** The live website, or null before launch. Going live closes the project, so it is read from the latest project. */
export interface LiveWebsite {
  readonly hostname: string;
  /** When the team put it live; null for a project that went live before launches were stamped. */
  readonly launchedAt: Date | null;
}

/** The facts Home's state and the calls rule are worked out from, read in one transaction. Throws on a failed read. */
export interface KickoffFacts {
  readonly booking: SetupCallBooking | null;
  /** The newest open project (not live, not cancelled), or null. */
  readonly project: Project | null;
  readonly live: LiveWebsite | null;
}

/** Ported from apps/platform lib/server/onboarding.ts getProjectOverview and readLiveWebsite, and lib/server/setup-call.ts. */
export async function readKickoffFacts(customer: CustomerContext): Promise<KickoffFacts> {
  return withTenantScope(getAppDb(), customer.tenant, async (tx) => {
    const [booking, project, latest] = [await findSetupCallBooking(tx, customer.businessId), await findOpenProject(tx), await findLatestProject(tx)];
    // A live project with no primary domain has no address to hand over; the admin's Mark live refuses it, so it is treated as not live.
    const domain = latest?.status === "live" ? await getPrimaryDomain(tx) : null;
    return { booking, project, live: latest?.status === "live" && domain !== null ? { hostname: domain.hostname, launchedAt: latest.launchedAt } : null };
  });
}

/** Whether calls after the kickoff are open for this customer (paid, and the first look is over). */
export function callsOpenFor(customer: CustomerContext, facts: KickoffFacts, now: Date): boolean {
  return callsAreOpen({
    hasAccess: customer.billing.hasAccess,
    websiteLive: facts.live !== null,
    setupSent: facts.project?.onboardingSubmittedAt != null,
    callHeld: facts.booking?.heldAt != null,
    callEndsAt: facts.booking?.endsAt ?? null,
    now,
  });
}

/** The business's calls after the kickoff, newest first. Throws on a failed read. */
export async function readTeamCalls(customer: CustomerContext): Promise<readonly TeamCall[]> {
  return withTenantScope(getAppDb(), customer.tenant, (tx) => listTeamCalls(tx, customer.businessId));
}

/** Tells the Customers channel a call was booked or moved. Best effort: never throws, and the customer never waits on it. */
async function announceCallBooked(
  customer: CustomerContext,
  call: {
    readonly kind: "kickoff" | "call";
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly replaced: { readonly startsAt: Date; readonly endsAt: Date } | null;
    readonly meetingUrl: string | null;
    readonly reason?: CallReason;
    readonly note?: string | null;
  },
): Promise<void> {
  try {
    const alert = callAlert({
      kind: call.kind,
      changed: call.replaced !== null,
      startsAt: call.startsAt,
      endsAt: call.endsAt,
      previousStartsAt: call.replaced?.startsAt ?? null,
      previousEndsAt: call.replaced?.endsAt ?? null,
      services: customer.services.map((service) => SERVICE_NAMES[service]),
      meetingUrl: call.meetingUrl,
      reason: call.reason ?? null,
      note: call.note ?? null,
    });
    await announceCustomerToTeams({ businessId: customer.businessId, ...alert });
  } catch (error) {
    reportError(error, { area: "calls.alert" });
  }
}

export type BookOutcome = { readonly ok: true; readonly startsAtIso: string; readonly endsAtIso: string } | { readonly ok: false; readonly reason: "taken" | "failed" | "limit" };

const inviteeOf = (customer: CustomerContext) => ({ name: customer.user.name, email: customer.user.email });

/**
 * Books the kickoff at the time the customer picked and notes it with its time. The time must be still ahead and inside the
 * booking window; whether it is free is the booking service's answer. A business changing its time has a booking already:
 * the new one is made first and the old one cancelled after, and only a booking still ahead is cancelled.
 */
export async function bookKickoff(customer: CustomerContext, startIso: string, timeZone: unknown, now: Date): Promise<BookOutcome> {
  const start = readSlotStart(startIso, now);
  if (start === null) return { ok: false, reason: "failed" };
  try {
    const url = await readBookingUrl();
    if (url === null) return { ok: false, reason: "failed" };
    const previous = await readKickoffBooking(customer);
    const result = await bookCallSlot(url, start.toISOString(), { ...inviteeOf(customer), timeZone: readTimeZone(timeZone), businessId: customer.businessId });
    if (result === null) return { ok: false, reason: "failed" };
    if (!result.ok) return result;
    await withTenantScope(getAppDb(), customer.tenant, (tx) =>
      // The booking service's own answer, not something from the browser.
      recordSetupCallBooking(tx, { businessId: customer.businessId, inviteeUri: result.call.inviteeUri, now, startsAt: result.call.startsAt, endsAt: result.call.endsAt }),
    );
    const previousAhead = previous?.startsAt != null && previous.startsAt > now;
    if (previousAhead && previous.inviteeUri !== null && previous.inviteeUri !== result.call.inviteeUri) {
      await cancelCallBooking(url, previous.inviteeUri).catch((error: unknown) => reportError(error, { area: "calls.kickoff-cancel-previous" }));
    }
    void announceCallBooked(customer, {
      kind: "kickoff",
      startsAt: result.call.startsAt,
      endsAt: result.call.endsAt,
      replaced: previousAhead && previous.startsAt !== null ? { startsAt: previous.startsAt, endsAt: previous.endsAt ?? previous.startsAt } : null,
      meetingUrl: result.call.meetingUrl,
    });
    return { ok: true, startsAtIso: result.call.startsAt.toISOString(), endsAtIso: result.call.endsAt.toISOString() };
  } catch (error) {
    reportError(error, { area: "calls.kickoff-book" });
    return { ok: false, reason: "failed" };
  }
}

export interface TeamCallRequest {
  readonly startIso: string;
  readonly timeZone: unknown;
  readonly reason: CallReason;
  readonly note: string | null;
  /** The call this one replaces (the customer is changing its time), or null. */
  readonly replaceId: string | null;
}

/**
 * Books a call after the kickoff and records it. At most three booked at once, not counting the one being changed; a
 * changed call must be booked and still ahead. When changing, the new time is booked first and the old booking cancelled
 * after, so a customer is never left with no call. If recording fails after the service booked, the booking is cancelled.
 */
export async function bookTeamCall(customer: CustomerContext, input: TeamCallRequest, now: Date): Promise<BookOutcome> {
  const start = readSlotStart(input.startIso, now);
  if (start === null) return { ok: false, reason: "failed" };
  try {
    const url = await readBookingUrl();
    if (url === null) return { ok: false, reason: "failed" };
    const existing = await readTeamCalls(customer);
    const previous = input.replaceId === null ? null : (existing.find((call) => call.id === input.replaceId && call.status === "booked" && call.startsAt > now) ?? null);
    if (input.replaceId !== null && previous === null) return { ok: false, reason: "failed" };
    if (upcomingCount(existing, now, previous?.id) >= MAX_UPCOMING_CALLS) return { ok: false, reason: "limit" };

    const result = await bookCallSlot(url, start.toISOString(), {
      ...inviteeOf(customer),
      timeZone: readTimeZone(input.timeZone),
      businessId: customer.businessId,
      purpose: "call",
      reason: input.reason,
      note: input.note,
    });
    if (result === null) return { ok: false, reason: "failed" };
    if (!result.ok) return result;

    try {
      await withTenantScope(getAppDb(), customer.tenant, (tx) =>
        recordTeamCall(tx, { businessId: customer.businessId, reason: input.reason, note: input.note, startsAt: result.call.startsAt, endsAt: result.call.endsAt, providerUri: result.call.inviteeUri }),
      );
    } catch (error) {
      reportError(error, { area: "calls.record" });
      if (result.call.inviteeUri !== null) await cancelCallBooking(url, result.call.inviteeUri).catch(() => undefined);
      return { ok: false, reason: "failed" };
    }

    if (previous !== null) {
      if (previous.providerUri !== null) {
        await cancelCallBooking(url, previous.providerUri).catch((error: unknown) => reportError(error, { area: "calls.cancel-previous" }));
      }
      await withTenantScope(getAppDb(), customer.tenant, (tx) => cancelTeamCall(tx, { id: previous.id, businessId: customer.businessId, now }));
    }
    void announceCallBooked(customer, {
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
    reportError(error, { area: "calls.book" });
    return { ok: false, reason: "failed" };
  }
}

export type CancelOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: "gone" | "failed" };

/**
 * Cancels a call that has not started: with the booking service first, so a call still on the host's calendar is never shown
 * as cancelled, then the call. `gone` is a call that is not there, is cancelled, or has started; a call the webhook cancelled
 * while this ran counts as cancelled by this.
 */
export async function cancelTeamCallFor(customer: CustomerContext, callId: string, now: Date): Promise<CancelOutcome> {
  try {
    const find = () => withTenantScope(getAppDb(), customer.tenant, (tx) => findTeamCall(tx, customer.businessId, callId));
    const call = await find();
    if (call === null || call.status !== "booked" || call.startsAt <= now) return { ok: false, reason: "gone" };
    if (call.providerUri !== null) {
      const url = await readBookingUrl();
      if (url !== null) await cancelCallBooking(url, call.providerUri);
    }
    const cancelled = await withTenantScope(getAppDb(), customer.tenant, (tx) => cancelTeamCall(tx, { id: call.id, businessId: customer.businessId, now }));
    if (cancelled) return { ok: true };
    const latest = await find();
    return latest?.status === "cancelled" ? { ok: true } : { ok: false, reason: "gone" };
  } catch (error) {
    reportError(error, { area: "calls.cancel" });
    return { ok: false, reason: "failed" };
  }
}
