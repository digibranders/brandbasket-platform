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
    expect(projectStageIndex({ status, onboardingSubmittedAt: SENT, previewSentAt: null })).toBe(index);
  });

  it("marks every stage done once the site is live", () => {
    expect(projectStageIndex({ status: "live", onboardingSubmittedAt: SENT, previewSentAt: SENT })).toBe(PROJECT_STAGES.length);
  });

  it("keeps an on_hold kickoff-first build at stage 1 before a preview, and at stage 2 once one was sent", () => {
    expect(projectStageIndex({ status: "on_hold", onboardingSubmittedAt: null, previewSentAt: null })).toBe(1);
    expect(projectStageIndex({ status: "on_hold", onboardingSubmittedAt: SENT, previewSentAt: null })).toBe(1);
    expect(projectStageIndex({ status: "on_hold", onboardingSubmittedAt: null, previewSentAt: SENT })).toBe(2);
  });

  it("keeps a cancelled project where it stopped", () => {
    expect(projectStageIndex({ status: "cancelled", onboardingSubmittedAt: null, previewSentAt: null })).toBe(0);
    expect(projectStageIndex({ status: "cancelled", onboardingSubmittedAt: SENT, previewSentAt: null })).toBe(1);
  });
});
