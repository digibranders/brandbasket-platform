import {
  addActivityEvent,
  findLatestKickoffOutcome,
  findSetupCallBooking,
  firstPreviewDueAfterKickoff,
  markProjectReadyAfterKickoff,
  markSetupCallHeld,
  recordKickoffOutcome,
  saveSetupCallSummary,
  type Database,
} from "@brandbasket/db";

export interface KickoffCompletion {
  readonly businessId: string;
  readonly staffId: string;
  readonly now: Date;
  /** What was agreed on the call, or null to leave the notes as they are. */
  readonly notes: string | null;
}

export interface KickoffCompletionResult {
  /** This call marked the kickoff held: false when it already was. */
  readonly newlyHeld: boolean;
  /** The Managed Website project moved from onboarding to submitted. */
  readonly buildStarted: boolean;
}

/**
 * Staff say the kickoff happened, with or without notes: the call is marked held, the notes are saved, and a Managed
 * Website project waiting in onboarding is ready to build, with the first preview due 48 hours after the call. This is
 * the step a person takes only for a call held by phone or to write the notes sooner. A booked call's build starts by itself
 * two hours after it ends (lib/server/kickoff-sync.ts in the dashboard), and that run does not mark the call held. A call
 * already held keeps its first held time. The call is recorded as completed unless its latest outcome already says so.
 */
export async function completeKickoff(db: Database, input: KickoffCompletion): Promise<KickoffCompletionResult> {
  const booking = await findSetupCallBooking(db, input.businessId);
  const alreadyHeld = booking?.heldAt != null;
  if (!alreadyHeld) await markSetupCallHeld(db, { businessId: input.businessId, staffId: input.staffId, now: input.now });
  const latest = await findLatestKickoffOutcome(db, input.businessId);
  if (latest?.outcome !== "completed") {
    await recordKickoffOutcome(db, {
      businessId: input.businessId,
      outcome: "completed",
      note: null,
      startsAt: booking?.startsAt ?? null,
      endsAt: booking?.endsAt ?? null,
      staffId: input.staffId,
      now: input.now,
    });
  }
  if (input.notes !== null) await saveSetupCallSummary(db, { businessId: input.businessId, staffId: input.staffId, summary: input.notes, now: input.now });
  const heldAt = alreadyHeld ? (booking?.heldAt ?? input.now) : input.now;
  const buildStarted = await markProjectReadyAfterKickoff(db, {
    businessId: input.businessId,
    dueAt: firstPreviewDueAfterKickoff({ endsAt: booking?.endsAt ?? null, heldAt, now: input.now }),
    now: input.now,
  });
  if (buildStarted) await addActivityEvent(db, { businessId: input.businessId, service: "website", title: "Kickoff call completed", occurredAt: input.now, staffId: input.staffId });
  return { newlyHeld: !alreadyHeld, buildStarted };
}
