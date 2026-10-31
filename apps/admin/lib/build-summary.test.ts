import type { ClientProject } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { buildPanelState } from "./build-summary";

function project(overrides: Partial<ClientProject>): ClientProject {
  return {
    id: "01a0f71b-8402-7d48-a90a-207e8c8a0001",
    status: "submitted",
    onboardingSubmittedAt: new Date("2026-11-20T09:00:00.000Z"),
    slaDueAt: new Date("2026-11-28T09:00:00.000Z"),
    previewUrl: null,
    previewSentAt: null,
    revisionRoundsGranted: 0,
    launchedAt: null,
    createdAt: new Date("2026-11-17T09:00:00.000Z"),
    ...overrides,
  };
}

describe("buildPanelState", () => {
  it("is none without a project", () => {
    expect(buildPanelState(null)).toBe("none");
  });

  it("is waiting while the project is in onboarding", () => {
    expect(buildPanelState(project({ status: "onboarding" }))).toBe("waiting");
  });

  it("is active for every status after onboarding", () => {
    const statuses = ["submitted", "building", "preview", "revisions", "approved", "live", "on_hold", "cancelled"] as const;
    for (const status of statuses) {
      expect(buildPanelState(project({ status }))).toBe("active");
    }
  });

  it("ignores whether the old setup checklist was sent", () => {
    expect(buildPanelState(project({ status: "submitted", onboardingSubmittedAt: null }))).toBe(buildPanelState(project({ status: "submitted" })));
    expect(buildPanelState(project({ status: "building", onboardingSubmittedAt: null }))).toBe("active");
  });
});
