import type { ProjectStatus } from "@brandbasket/db";
import type { TimelineStage } from "@/components/panel/project-timeline";

export const PROJECT_STAGES: readonly TimelineStage[] = [
  { title: "Set up your website", detail: "You tell us about your business, your services and your domain." },
  { title: "We build it", detail: "We design and build your website from what you sent." },
  { title: "You review it", detail: "You look over a preview and tell us what to change." },
  { title: "It goes live", detail: "Your website goes live on your own domain." },
];

export interface ProjectStageInput {
  readonly status: ProjectStatus;
  readonly onboardingSubmittedAt: Date | null;
  readonly previewSentAt: Date | null;
}

/**
 * The timeline stage in progress, from the project's status. Returns PROJECT_STAGES.length once the site is live,
 * so every stage shows as done. A paused build stays at the stage it was paused in, worked out from whether a preview
 * was sent: a pause can only start after the build was sent to us, so it is never before stage 1.
 */
export function projectStageIndex(project: ProjectStageInput): number {
  switch (project.status) {
    case "onboarding":
      return 0;
    case "submitted":
    case "building":
      return 1;
    case "preview":
    case "revisions":
      return 2;
    case "approved":
      return 3;
    case "live":
      return PROJECT_STAGES.length;
    case "on_hold":
      return project.previewSentAt !== null ? 2 : 1;
    case "cancelled":
      return project.onboardingSubmittedAt === null ? 0 : 1;
  }
}
