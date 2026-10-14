import type { ProjectStatus } from "@firstfold/db";

export type TourStageState = "not-started" | "in-progress" | "done" | "paused" | "ongoing";

export const TOUR_STAGE_LABELS: Readonly<Record<TourStageState, string>> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  done: "Done",
  paused: "Paused",
  ongoing: "Ongoing",
};

/** The six stages of the plan tour, in order: tell us, design, build, review, go live, keep it fresh. */
export const TOUR_STAGE_COUNT = 6;

export interface TourStageInput {
  /** The project's status, or null when there is no project yet. */
  readonly status: ProjectStatus | null;
  /** Onboarding steps already saved. */
  readonly completedSteps: number;
  /** Whether the answers were sent before the build was paused or stopped. */
  readonly submitted: boolean;
}

const NOT_STARTED: TourStageState = "not-started";

function states(...leading: TourStageState[]): readonly TourStageState[] {
  return [...leading, ...Array<TourStageState>(TOUR_STAGE_COUNT - leading.length).fill(NOT_STARTED)];
}

/**
 * Where each stage of the tour stands, from the same project status the next-step card reads, so the two never
 * disagree. Designing and building happen together in one "building" status, so they move together.
 */
export function tourStageStates({ status, completedSteps, submitted }: TourStageInput): readonly TourStageState[] {
  switch (status) {
    case null:
      return states();
    case "onboarding":
      return states(completedSteps > 0 ? "in-progress" : NOT_STARTED);
    case "submitted":
    case "building":
      return states("done", "in-progress", "in-progress");
    case "on_hold":
      return submitted ? states("done", "paused", "paused") : states("paused");
    case "preview":
    case "revisions":
      return states("done", "done", "done", "in-progress");
    case "approved":
      return states("done", "done", "done", "done", "in-progress");
    case "live":
      return states("done", "done", "done", "done", "done", "ongoing");
    case "cancelled":
      return submitted ? states("done") : states();
  }
}
