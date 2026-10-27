import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { setupCallBookings, type SetupCallBooking } from "../schema";

type Runner = Database | ScopedTransaction;

/** The business's booked kickoff call, or null when it has not booked one. Read through row-level security. */
export async function findSetupCallBooking(db: Runner, businessId: string): Promise<SetupCallBooking | null> {
  const rows = await db.select().from(setupCallBookings).where(eq(setupCallBookings.businessId, businessId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Notes that the business booked its kickoff call. A second booking (a reschedule, or a new time) replaces the first, so
 * there is one row a business and `bookedAt` is the latest.
 */
export async function recordSetupCallBooking(
  db: Runner,
  input: {
    readonly businessId: string;
    readonly inviteeUri: string | null;
    readonly now: Date;
    /** The meeting's time when the booking is made here, so it is known at once; both or neither. */
    readonly startsAt?: Date;
    readonly endsAt?: Date;
  },
): Promise<void> {
  const times = { startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null };
  await db
    .insert(setupCallBookings)
    .values({ businessId: input.businessId, inviteeUri: input.inviteeUri, bookedAt: input.now, ...times })
    .onConflictDoUpdate({
      target: setupCallBookings.businessId,
      set: { inviteeUri: input.inviteeUri, bookedAt: input.now, updatedAt: input.now, ...times },
    });
}

/**
 * Moves a booked call to the time its booking service rescheduled it to, found by the booking it replaces (the client
 * rescheduled from the booking service's email, not the dashboard). True when a booking moved. Staff connection.
 */
export async function moveSetupCallBooking(
  db: Runner,
  input: { readonly fromInviteeUri: string; readonly toInviteeUri: string; readonly startsAt: Date; readonly endsAt: Date; readonly now: Date },
): Promise<boolean> {
  const moved = await db
    .update(setupCallBookings)
    .set({ inviteeUri: input.toInviteeUri, startsAt: input.startsAt, endsAt: input.endsAt, updatedAt: input.now })
    .where(eq(setupCallBookings.inviteeUri, input.fromInviteeUri))
    .returning({ id: setupCallBookings.id });
  return moved.length > 0;
}

/**
 * Forgets a booked call its booking service says was cancelled, so the dashboard asks for a time again. A call staff
 * already marked held keeps its row and its held mark (the call happened; only the booking is gone), so only the booking
 * address and times are cleared. True when a row was removed or cleared. A booking the dashboard replaced is no longer
 * stored under its old address, so its cancel finds nothing. Staff connection.
 */
export async function removeSetupCallBooking(db: Runner, inviteeUri: string): Promise<boolean> {
  const cleared = await db
    .update(setupCallBookings)
    .set({ inviteeUri: null, startsAt: null, endsAt: null, updatedAt: sql`now()` })
    .where(and(eq(setupCallBookings.inviteeUri, inviteeUri), isNotNull(setupCallBookings.heldAt)))
    .returning({ id: setupCallBookings.id });
  const removed = await db
    .delete(setupCallBookings)
    .where(and(eq(setupCallBookings.inviteeUri, inviteeUri), isNull(setupCallBookings.heldAt)))
    .returning({ id: setupCallBookings.id });
  return cleared.length + removed.length > 0;
}

/**
 * Staff mark the kickoff call as held. A business that never booked through the dashboard (the call happened by phone)
 * gets a row with no times, so the mark still has somewhere to live. Staff connection. True when the row now says held.
 */
export async function markSetupCallHeld(db: Runner, input: { readonly businessId: string; readonly staffId: string; readonly now: Date }): Promise<boolean> {
  const rows = await db
    .insert(setupCallBookings)
    .values({ businessId: input.businessId, bookedAt: input.now, heldAt: input.now, heldByStaffId: input.staffId })
    .onConflictDoUpdate({
      target: setupCallBookings.businessId,
      set: { heldAt: input.now, heldByStaffId: input.staffId, updatedAt: input.now },
    })
    .returning({ id: setupCallBookings.id });
  return rows.length > 0;
}

/**
 * Undoes the mark, and the summary with it (only a held call has one). A row made only for a phone call (no booking address, no times) has nothing left once it is unmarked,
 * so it is deleted; a booked call keeps its booking. True when a call was held and no longer is. Staff connection.
 * The mark is cleared first so the customer role, which may not touch it, is refused by the guard trigger and never
 * reaches the delete.
 */
export async function clearSetupCallHeld(db: Runner, businessId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(setupCallBookings)
    .set({ heldAt: null, heldByStaffId: null, summary: null, summaryAt: null, summaryByStaffId: null, updatedAt: now })
    .where(and(eq(setupCallBookings.businessId, businessId), isNotNull(setupCallBookings.heldAt)))
    .returning({ inviteeUri: setupCallBookings.inviteeUri, startsAt: setupCallBookings.startsAt });
  const row = rows[0];
  if (row !== undefined && row.inviteeUri === null && row.startsAt === null) {
    await db
      .delete(setupCallBookings)
      .where(
        and(
          eq(setupCallBookings.businessId, businessId),
          isNull(setupCallBookings.heldAt),
          isNull(setupCallBookings.inviteeUri),
          isNull(setupCallBookings.startsAt),
        ),
      );
  }
  return rows.length > 0;
}

/**
 * Staff write (or, with null, clear) what was agreed on the kickoff call. Only a held call has a summary. True when the held
 * call was updated. Staff connection.
 */
export async function saveSetupCallSummary(
  db: Runner,
  input: { readonly businessId: string; readonly staffId: string; readonly summary: string | null; readonly now: Date },
): Promise<boolean> {
  const written =
    input.summary === null
      ? { summary: null, summaryAt: null, summaryByStaffId: null }
      : { summary: input.summary, summaryAt: input.now, summaryByStaffId: input.staffId };
  const rows = await db
    .update(setupCallBookings)
    .set({ ...written, updatedAt: input.now })
    .where(and(eq(setupCallBookings.businessId, input.businessId), isNotNull(setupCallBookings.heldAt)))
    .returning({ id: setupCallBookings.id });
  return rows.length > 0;
}
