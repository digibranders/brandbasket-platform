import type { ProjectStatus } from "../schema";

/** The moves staff make by hand on a build. Starting, holding and resuming it are the website build's own (website-actions). */
export type ProjectMove = "cancel" | "assign" | "grant-round";

const OPEN_STATUSES: readonly ProjectStatus[] = ["onboarding", "submitted", "building", "preview", "revisions", "approved", "on_hold"];

/**
 * The statuses each move may start from. The queries in project-staff.ts put the same list in their WHERE clause, so the
 * database is the gate and the console only uses this list to decide which buttons to show.
 */
export const PROJECT_MOVE_FROM: Readonly<Record<ProjectMove, readonly ProjectStatus[]>> = {
  cancel: OPEN_STATUSES,
  assign: OPEN_STATUSES,
  "grant-round": ["preview", "revisions", "approved"],
};

export function canMoveProject(move: ProjectMove, status: ProjectStatus): boolean {
  return PROJECT_MOVE_FROM[move].includes(status);
}
