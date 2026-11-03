import "server-only";
import { isPhoneAccountEmail } from "@brandbasket/db";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { callRows, reasonOptions, type CallRow, type ReasonOption } from "./rules";
import { callsOpenFor, readBookingUrl, readKickoffFacts, readTeamCalls } from "./server/calls";

/** What Book a call needs, or null when it is not offered: calls are not open yet, or there is no booking page to book through. */
export interface BookOptions {
  readonly options: readonly ReasonOption[];
  readonly bookingUrl: string;
  /** False for a viewer, or an account without a real email address: the invitation could not reach it. */
  readonly canBook: boolean;
}

export interface CallsView {
  readonly upcoming: readonly CallRow[];
  readonly past: readonly CallRow[];
  readonly book: BookOptions | null;
}

/** Whether this member can book: not a viewer, and with a real email address. */
export function canBookCalls(customer: CustomerContext): boolean {
  return customer.role !== "viewer" && !isPhoneAccountEmail(customer.user.email);
}

/**
 * The calls of the business, kickoff included, and whether Book a call is offered. One read for both lists: a failure shows
 * the error, never an empty list that looks like having no calls (and never hides Book a call as if the feature were off).
 */
export function loadCalls(customer: CustomerContext, now: Date = new Date()): Promise<Loaded<CallsView>> {
  return load("help.calls", async () => {
    const [facts, calls, bookingUrl] = await Promise.all([readKickoffFacts(customer), readTeamCalls(customer), readBookingUrl()]);
    const booking = facts.booking;
    const rows = callRows({
      calls,
      kickoff: booking === null ? null : { startsAt: booking.startsAt, endsAt: booking.endsAt, heldAt: booking.heldAt, summary: booking.summary },
      now,
    });
    const open = callsOpenFor(customer, facts, now);
    return {
      ...rows,
      book: !open || bookingUrl === null ? null : { options: reasonOptions(customer.services), bookingUrl, canBook: canBookCalls(customer) },
    };
  });
}
