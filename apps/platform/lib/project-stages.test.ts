import { describe, expect, it } from "vitest";
import { PROJECT_STAGES, projectStageIndex } from "./project-stages";

const SENT = new Date("2026-09-16T10:00:00Z");

describe("projectStageIndex", () => {
  it.each([
    ["onboarding", 0],
    ["submitted", 1],
    ["building", 1],
    ["preview", 2],
    ["revisions", 2],
    ["approved", 3],
  ] as const)("puts a %s project at stage %i", (status, index) => {
    expect(projectStageIndex({ status, onboardingSubmittedAt: SENT })).toBe(index);
  });

  it("marks every stage done once the site is live", () => {
    expect(projectStageIndex({ status: "live", onboardingSubmittedAt: SENT })).toBe(PROJECT_STAGES.length);
  });

  it.each(["on_hold", "cancelled"] as const)("keeps a %s project where it stopped", (status) => {
    expect(projectStageIndex({ status, onboardingSubmittedAt: null })).toBe(0);
    expect(projectStageIndex({ status, onboardingSubmittedAt: SENT })).toBe(1);
  });
});
