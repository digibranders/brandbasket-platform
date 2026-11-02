import type { ProjectStatus } from "@brandbasket/db";

/** The words on the Delivery tab's next-step card, one per stage. Staff stage names come from project-stage.ts. */
export const NEXT_STEP_HEADLINES: Readonly<Record<ProjectStatus, string>> = {
  onboarding: "Waiting for the customer's setup",
  submitted: "Start building",
  building: "Send the first preview",
  preview: "Waiting for the customer's review",
  revisions: "Make the customer's changes",
  approved: "Go live",
  live: "Nothing needed",
  on_hold: "The build is on hold",
  cancelled: "Nothing needed",
};

export const SEND_PREVIEW_LABEL = "Send preview";
export const SEND_UPDATED_PREVIEW_LABEL = "Send updated preview";

/** The date the build owes the customer, named for what it is. Null when nothing is owed (preview sent, approved, live). */
export function dueDateLabel(status: ProjectStatus): "First preview due" | "Updated preview due" | null {
  if (status === "submitted" || status === "building") return "First preview due";
  return status === "revisions" ? "Updated preview due" : null;
}

/** Rounds of changes the customer has asked for, out of those the build includes. */
export function roundsText(used: number, included: number): string {
  return `${used} of ${included}`;
}

/** A feedback round as staff read it. The ticket code behind it is for support, not for this page. */
export function roundName(round: number): string {
  return `Round ${round}`;
}
