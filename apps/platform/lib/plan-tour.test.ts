import { describe, expect, it } from "vitest";
import { TOUR_STAGE_COUNT, tourStageStates } from "./plan-tour";

const NS = "not-started";

describe("tourStageStates", () => {
  it("always describes all six stages", () => {
    for (const status of [null, "onboarding", "submitted", "building", "preview", "revisions", "approved", "live", "on_hold", "cancelled"] as const) {
      expect(tourStageStates({ status, completedSteps: 0, submitted: false })).toHaveLength(TOUR_STAGE_COUNT);
    }
  });

  it("starts with nothing begun", () => {
    expect(tourStageStates({ status: null, completedSteps: 0, submitted: false })).toEqual([NS, NS, NS, NS, NS, NS]);
    expect(tourStageStates({ status: "onboarding", completedSteps: 0, submitted: false })).toEqual([NS, NS, NS, NS, NS, NS]);
  });

  it("marks the first stage in progress once a step is saved", () => {
    expect(tourStageStates({ status: "onboarding", completedSteps: 2, submitted: false })[0]).toBe("in-progress");
  });

  it("moves design and build together once the answers are sent", () => {
    for (const status of ["submitted", "building"] as const) {
      expect(tourStageStates({ status, completedSteps: 5, submitted: true })).toEqual([
        "done",
        "in-progress",
        "in-progress",
        NS,
        NS,
        NS,
      ]);
    }
  });

  it("follows the build through review, launch and afterwards", () => {
    expect(tourStageStates({ status: "revisions", completedSteps: 5, submitted: true })).toEqual([
      "done",
      "done",
      "done",
      "in-progress",
      NS,
      NS,
    ]);
    expect(tourStageStates({ status: "approved", completedSteps: 5, submitted: true })[4]).toBe("in-progress");
    expect(tourStageStates({ status: "live", completedSteps: 5, submitted: true })).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "ongoing",
    ]);
  });

  it("shows a pause where the build stopped", () => {
    expect(tourStageStates({ status: "on_hold", completedSteps: 5, submitted: true }).slice(0, 3)).toEqual([
      "done",
      "paused",
      "paused",
    ]);
    expect(tourStageStates({ status: "on_hold", completedSteps: 1, submitted: false })[0]).toBe("paused");
  });
});
