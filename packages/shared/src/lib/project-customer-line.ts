import type { ProjectStatus } from "@brandbasket/db";

/** The headline the customer reads for each database status. Staff wording is in project-status.ts and project-stage.ts. */
export const CUSTOMER_STAGE_HEADLINE: Readonly<Record<ProjectStatus, string>> = {
  onboarding: "We start after your kickoff call",
  submitted: "We are preparing your website",
  building: "We are building your website",
  preview: "Your preview is ready",
  revisions: "We are making your changes",
  approved: "You approved the preview",
  live: "Your website is live",
  on_hold: "Your build is paused",
  cancelled: "Nothing is being built right now",
};
