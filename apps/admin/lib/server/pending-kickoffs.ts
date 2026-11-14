import "server-only";
import { listKickoffBoard } from "@brandbasket/db";
import { getStaffDb } from "./db";

export interface PendingKickoffPrompt {
  readonly businessId: string;
  readonly businessName: string;
  readonly endsAt: Date;
}

const LOOK_BACK_DAYS = 14;

/**
 * Kickoff calls that have ended but have not been confirmed by staff (heldAt is null),
 * and whose project has not already moved past onboarding.
 */
export async function listPendingKickoffPrompts(now: Date = new Date()): Promise<readonly PendingKickoffPrompt[]> {
  const db = getStaffDb();
  const board = await listKickoffBoard(db, { now, lookBackDays: LOOK_BACK_DAYS });
  return board
    .filter(
      (row) =>
        row.heldAt === null &&
        row.endsAt !== null &&
        row.endsAt.getTime() <= now.getTime() &&
        (row.projectStatus === null || row.projectStatus === "onboarding"),
    )
    .map((row) => ({
      businessId: row.businessId,
      businessName: row.businessName,
      endsAt: row.endsAt as Date,
    }));
}
