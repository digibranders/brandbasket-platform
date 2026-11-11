"use server";

import { isPhoneAccountEmail } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { requireBilling, type CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { BOOK_PROBLEM_TEXT, bookCallInput, CALLS_CLOSED_MESSAGE, callIdInput, readBookCall, REASON_MESSAGE, reasonOptions, VIEWER_MESSAGE } from "./rules";
import { bookKickoff, bookTeamCall, callsOpenFor, cancelTeamCallFor, readBookingUrl, readKickoffFacts } from "./server/calls";
import { listCallSlots } from "./server/scheduling";

/*
 * Booking, changing and cancelling calls. Ported from apps/platform app/app-host/(protected)/setup-call-actions.ts and
 * requests/calls/actions.ts. Every action calls its own guard; the business comes from the session. Booking needs a paid
 * period running now, a member who may write, and a real email address (the invitation could not reach a phone account).
 */

/** Whether calls are open, read fresh: a failed read refuses the action rather than guessing. */
async function callsOpen(customer: CustomerContext, now: Date): Promise<boolean | null> {
  try {
    return callsOpenFor(customer, await readKickoffFacts(customer), now);
  } catch (error) {
    reportError(error, { area: "calls.open" });
    return null;
  }
}

/** The times on offer, or `unavailable` when none can be offered here (the booking page link is shown instead). */
export type SlotList = { readonly status: "ok"; readonly slots: readonly string[] } | { readonly status: "unavailable"; readonly bookingUrl: string | null };

function refuseWriter(customer: CustomerContext): string | null {
  if (customer.role === "viewer") return VIEWER_MESSAGE;
  if (isPhoneAccountEmail(customer.user.email)) return BOOK_PROBLEM_TEXT.no_email;
  return null;
}

function afterChange(): void {
  revalidatePath("/");
  revalidatePath("/help");
}

/** The times that can be booked. A failure to list them is reported and offers the booking page, which says so on screen. */
export async function loadSlotsAction(): Promise<ActionResult<SlotList>> {
  await requireBilling();
  let bookingUrl: string | null = null;
  try {
    bookingUrl = await readBookingUrl();
    const slots = bookingUrl === null ? null : await listCallSlots(bookingUrl, new Date());
    return actionOk(slots === null || slots.length === 0 ? { status: "unavailable", bookingUrl } : { status: "ok", slots });
  } catch (error) {
    reportError(error, { area: "calls.slots" });
    return actionOk({ status: "unavailable", bookingUrl });
  }
}

const kickoffInput = z.object({ startIso: z.string().max(64), timeZone: z.string().max(64).optional() });

/** Books (or moves) the kickoff call. */
export async function bookKickoffAction(input: unknown): Promise<ActionResult<{ readonly startsAtIso: string; readonly endsAtIso: string }>> {
  const customer = await requireBilling();
  const refused = refuseWriter(customer);
  if (refused !== null) return actionFail(refused);
  const parsed = kickoffInput.safeParse(input);
  if (!parsed.success) return actionFail(BOOK_PROBLEM_TEXT.failed);
  const result = await bookKickoff(customer, parsed.data.startIso, parsed.data.timeZone, new Date());
  if (!result.ok) return actionFail(BOOK_PROBLEM_TEXT[result.reason]);
  afterChange();
  return actionOk({ startsAtIso: result.startsAtIso, endsAtIso: result.endsAtIso });
}

/** Books a call after the kickoff, or moves one (`replaceId`). */
export async function bookCallAction(input: unknown): Promise<ActionResult<{ readonly startsAtIso: string; readonly endsAtIso: string }>> {
  const customer = await requireBilling();
  const refused = refuseWriter(customer);
  if (refused !== null) return actionFail(refused);
  const parsed = bookCallInput.safeParse(input);
  if (!parsed.success) return actionFail(BOOK_PROBLEM_TEXT.failed);
  const allowed = reasonOptions(customer.services).map((option) => option.value);
  const form = readBookCall({ reason: parsed.data.reason, note: parsed.data.note }, allowed);
  if (!form.ok) return actionFail(form.message, { [form.message === REASON_MESSAGE ? "reason" : "note"]: form.message });
  const now = new Date();
  const open = await callsOpen(customer, now);
  if (open === null) return actionFail(BOOK_PROBLEM_TEXT.failed);
  if (!open) return actionFail(CALLS_CLOSED_MESSAGE);
  const result = await bookTeamCall(customer, { startIso: parsed.data.startIso, timeZone: parsed.data.timeZone, reason: form.reason, note: form.note, replaceId: parsed.data.replaceId ?? null }, now);
  if (!result.ok) return actionFail(BOOK_PROBLEM_TEXT[result.reason]);
  afterChange();
  return actionOk({ startsAtIso: result.startsAtIso, endsAtIso: result.endsAtIso });
}

const CANCEL_FAILED_MESSAGE = "We could not cancel that call. Please try again.";

/** Cancels a call that has not started. A call that is already gone counts as cancelled. */
export async function cancelCallAction(callId: unknown): Promise<ActionResult> {
  const customer = await requireBilling();
  if (customer.role === "viewer") return actionFail(VIEWER_MESSAGE);
  const id = callIdInput.safeParse(callId);
  if (!id.success) return actionFail(CANCEL_FAILED_MESSAGE);
  const now = new Date();
  const open = await callsOpen(customer, now);
  if (open === null) return actionFail(CANCEL_FAILED_MESSAGE);
  if (!open) return actionFail(CALLS_CLOSED_MESSAGE);
  const result = await cancelTeamCallFor(customer, id.data, now);
  // A call that is gone (already cancelled, by the webhook or another tab) counts as cancelled, as it did in the old app.
  if (!result.ok && result.reason === "failed") return actionFail(CANCEL_FAILED_MESSAGE);
  afterChange();
  return actionOk();
}
