import { eq } from "drizzle-orm";
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
