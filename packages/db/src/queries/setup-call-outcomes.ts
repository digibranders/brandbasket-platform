import { desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { setupCallOutcomes, type KickoffOutcome } from "../schema";

export { KICKOFF_OUTCOMES, type KickoffOutcome } from "../schema";

/**
 * Records what staff saw on a kickoff call. Written through the staff connection once the call is over. The call's times are
 * the booking's as they stand at that moment, so a reschedule made later leaves this record as it was.
 */
export async function recordKickoffOutcome(
  db: Database,
  input: {
    readonly businessId: string;
    readonly outcome: KickoffOutcome;
    readonly note: string | null;
    readonly startsAt: Date | null;
    readonly endsAt: Date | null;
    readonly staffId: string;
    readonly now: Date;
  },
): Promise<void> {
  await db.insert(setupCallOutcomes).values({
    businessId: input.businessId,
    outcome: input.outcome,
    note: input.note,
    callStartsAt: input.startsAt,
    callEndsAt: input.endsAt,
    recordedByStaffId: input.staffId,
    recordedAt: input.now,
  });
}

/** The newest outcome recorded for a business's kickoff call, or null when none has been recorded. */
export async function findLatestKickoffOutcome(
  db: Database,
  businessId: string,
): Promise<{
  readonly outcome: KickoffOutcome;
  readonly note: string | null;
  readonly recordedAt: Date;
  readonly recordedByStaffId: string;
} | null> {
  const [row] = await db
    .select({
      outcome: setupCallOutcomes.outcome,
      note: setupCallOutcomes.note,
      recordedAt: setupCallOutcomes.recordedAt,
      recordedByStaffId: setupCallOutcomes.recordedByStaffId,
    })
    .from(setupCallOutcomes)
    .where(eq(setupCallOutcomes.businessId, businessId))
    .orderBy(desc(setupCallOutcomes.recordedAt), desc(setupCallOutcomes.id))
    .limit(1);
  return row ?? null;
}
