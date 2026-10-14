import type { ProjectStatus } from "@firstfold/db";

/** How the team refers to each stage of a build. */
export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  onboarding: "Setting up",
  submitted: "Sent to us",
  building: "Building",
  preview: "Preview ready",
  revisions: "Changes requested",
  approved: "Approved",
  live: "Live",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

/** Stages where the next move is ours, so the staff console can draw attention to them. */
export const PROJECT_STATUSES_WAITING_ON_US: readonly ProjectStatus[] = ["submitted", "building", "revisions"];
