import "server-only";
import { addActivityEvent, resumeProject, setProjectBuilding, setProjectOnHold, type Database } from "@brandbasket/db";

/** The database refuses an activity title over 140 characters. */
const MAX_LINE = 140;

export interface WebsiteMove {
  readonly businessId: string;
  readonly staffId: string;
}

/**
 * One dated "What we did" line for the customer, on the staff connection. A failure is logged and swallowed: the move has
 * already happened, and a missing line must not make staff think it did not.
 */
export async function addWorkingActivity(db: Database, input: { readonly businessId: string; readonly staffId: string; readonly title: string; readonly now: Date }): Promise<void> {
  try {
    await addActivityEvent(db, { businessId: input.businessId, service: "website", title: input.title, occurredAt: input.now, staffId: input.staffId });
  } catch (error) {
    console.error("[website-moves] could not write the activity line", { businessId: input.businessId, title: input.title, error });
  }
}

/** submitted to building. */
export async function startBuilding(db: Database, move: WebsiteMove, now: Date): Promise<void> {
  await setProjectBuilding(db, { businessId: move.businessId });
  await addWorkingActivity(db, { ...move, title: "We started building your website", now });
}

/** A pausable status to on hold, with the reason the customer reads. */
export async function putOnHold(db: Database, move: WebsiteMove & { readonly reason: string }, now: Date): Promise<void> {
  const project = await setProjectOnHold(db, { businessId: move.businessId, reason: move.reason });
  const line = `We paused your website build: ${project.onHoldReason ?? move.reason.trim()}`;
  await addWorkingActivity(db, { ...move, title: line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1).trimEnd()}…` : line, now });
}

/** On hold back to the stage before the pause. */
export async function resumeBuilding(db: Database, move: WebsiteMove, now: Date): Promise<void> {
  await resumeProject(db, { businessId: move.businessId });
  await addWorkingActivity(db, { ...move, title: "We are building your website again", now });
}
