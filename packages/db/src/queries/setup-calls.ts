import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businesses, setupCallBookings, type SetupCallBooking } from "../schema";

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
 * Forgets a booked call its booking service says was cancelled, so the dashboard asks for a time again. True when one was
 * removed. A booking the dashboard replaced is no longer stored under its old address, so its cancel removes nothing.
 * Staff connection.
 */
export async function removeSetupCallBooking(db: Runner, inviteeUri: string): Promise<boolean> {
  const removed = await db.delete(setupCallBookings).where(eq(setupCallBookings.inviteeUri, inviteeUri)).returning({ id: setupCallBookings.id });
  return removed.length > 0;
}

/** A kickoff call with a time, and the business it is for. */
export interface BookedCall {
  readonly businessId: string;
  readonly businessName: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/**
 * Calls starting between `from` (included) and `to` (excluded), earliest first, for every business: the console reads
 * them over the staff connection. A booking whose time the booking page never reported has no place on a day and is
 * left out.
 */
export async function listSetupCallsBetween(db: Runner, from: Date, to: Date): Promise<BookedCall[]> {
  const rows = await db
    .select({
      businessId: setupCallBookings.businessId,
      businessName: businesses.name,
      startsAt: setupCallBookings.startsAt,
      endsAt: setupCallBookings.endsAt,
    })
    .from(setupCallBookings)
    .innerJoin(businesses, eq(businesses.id, setupCallBookings.businessId))
    .where(and(gte(setupCallBookings.startsAt, from), lt(setupCallBookings.startsAt, to)))
    .orderBy(asc(setupCallBookings.startsAt));
  return rows.flatMap((row) =>
    row.startsAt === null || row.endsAt === null
      ? []
      : [{ businessId: row.businessId, businessName: row.businessName, startsAt: row.startsAt, endsAt: row.endsAt }],
  );
}

