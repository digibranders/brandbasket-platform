import type { ProjectStatus } from "@brandbasket/db";

/**
 * What staff call each step of a website build. The database status stays the source of truth: this only names it.
 * "submitted" is "ready to start" because nobody has begun work; "building" begins when staff press Start.
 */
export type StaffStage =
  | "waiting_for_kickoff"
  | "ready_to_start"
  | "building"
  | "awaiting_review"
  | "changes_requested"
  | "approved"
  | "live"
  | "on_hold"
  | "cancelled";

export const STAFF_STAGE_LABELS: Readonly<Record<StaffStage, string>> = {
  waiting_for_kickoff: "Waiting for kickoff",
  ready_to_start: "Ready to start",
  building: "Building",
  awaiting_review: "Awaiting client review",
  changes_requested: "Changes requested",
  approved: "Approved, ready to launch",
  live: "Live",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

const STAGE_OF_STATUS: Readonly<Record<ProjectStatus, StaffStage>> = {
  onboarding: "waiting_for_kickoff",
  submitted: "ready_to_start",
  building: "building",
  preview: "awaiting_review",
  revisions: "changes_requested",
  approved: "approved",
  live: "live",
  on_hold: "on_hold",
  cancelled: "cancelled",
};

export function staffStageOf(status: ProjectStatus): StaffStage {
  return STAGE_OF_STATUS[status];
}
