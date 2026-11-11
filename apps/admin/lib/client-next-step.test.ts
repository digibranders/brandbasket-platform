import type { ClientProject } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { clientNextStep, overviewNextStep, previewLateReason } from "./client-next-step";
import { NEXT_STEP_HEADLINES } from "./delivery-tab";

const NOW = new Date("2026-11-30T09:00:00.000Z");

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

describe("clientNextStep", () => {
  it("is nothing while in onboarding, with or without a setup date", () => {
    expect(clientNextStep(null)).toBeNull();
    expect(clientNextStep(project({ status: "onboarding", onboardingSubmittedAt: null }))).toBeNull();
    expect(clientNextStep(project({ status: "onboarding" }))).toBeNull();
  });

  it("is the preview while we build, and going live once approved", () => {
    expect(clientNextStep(project({ status: "submitted" }))).toBe("preview");
    expect(clientNextStep(project({ status: "building" }))).toBe("preview");
    expect(clientNextStep(project({ status: "revisions" }))).toBe("preview");
    expect(clientNextStep(project({ status: "approved" }))).toBe("live");
    expect(clientNextStep(project({ status: "preview" }))).toBeNull();
  });
});

describe("kickoff-first projects (no setup date)", () => {
  it("are the preview while we build, and going live once approved", () => {
    expect(clientNextStep(project({ status: "submitted", onboardingSubmittedAt: null }))).toBe("preview");
    expect(clientNextStep(project({ status: "building", onboardingSubmittedAt: null }))).toBe("preview");
    expect(clientNextStep(project({ status: "revisions", onboardingSubmittedAt: null }))).toBe("preview");
    expect(clientNextStep(project({ status: "approved", onboardingSubmittedAt: null }))).toBe("live");
  });

  it("are nothing once previewed, on hold, live or cancelled", () => {
    expect(clientNextStep(project({ status: "preview", onboardingSubmittedAt: null }))).toBeNull();
    expect(clientNextStep(project({ status: "on_hold", onboardingSubmittedAt: null }))).toBeNull();
    expect(clientNextStep(project({ status: "live", onboardingSubmittedAt: null }))).toBeNull();
    expect(clientNextStep(project({ status: "cancelled", onboardingSubmittedAt: null }))).toBeNull();
  });
});

describe("previewLateReason", () => {
  it("says how late a preview we still owe is", () => {
    expect(previewLateReason(project({}), NOW)).toBe("Preview 2 days late");
  });

  it("is null when nothing is owed or it is not due yet", () => {
    expect(previewLateReason(project({ status: "preview" }), NOW)).toBeNull();
    expect(previewLateReason(project({ slaDueAt: new Date("2026-12-02T09:00:00.000Z") }), NOW)).toBeNull();
    expect(previewLateReason(project({ slaDueAt: null }), NOW)).toBeNull();
    expect(previewLateReason(null, NOW)).toBeNull();
  });
});

describe("overviewNextStep", () => {
  it("puts a domain move first", () => {
    expect(overviewNextStep({ project: project({ status: "live" }), movingTo: { hostname: "omsweets.in", status: "pending" } }, NOW)).toEqual({ label: "Move them to their own domain", anchor: "domain" });
  });

  it("starts a submitted build, late or not, linking to the top of the Website tab, where Start building is", () => {
    expect(overviewNextStep({ project: project({}), movingTo: null }, NOW)).toEqual({ label: "Start building: preview 2 days late", anchor: null });
    expect(overviewNextStep({ project: project({ slaDueAt: null }), movingTo: null }, NOW)).toEqual({ label: "Start building", anchor: null });
  });

  it("keeps sending the preview while building, and making the changes in revisions, late or not", () => {
    expect(overviewNextStep({ project: project({ status: "building" }), movingTo: null }, NOW)).toEqual({ label: "Send the first preview: preview 2 days late", anchor: null });
    expect(overviewNextStep({ project: project({ status: "building", slaDueAt: null }), movingTo: null }, NOW)).toEqual({ label: "Send the first preview", anchor: null });
    expect(overviewNextStep({ project: project({ status: "revisions" }), movingTo: null }, NOW)).toEqual({ label: "Make the customer's changes: preview 2 days late", anchor: null });
  });

  it("names going live once approved", () => {
    expect(overviewNextStep({ project: project({ status: "approved" }), movingTo: null }, NOW)).toEqual({ label: "Go live", anchor: "domain" });
  });

  it("starts the build and goes live for kickoff-first projects", () => {
    expect(overviewNextStep({ project: project({ onboardingSubmittedAt: null, slaDueAt: null }), movingTo: null }, NOW)).toEqual({ label: "Start building", anchor: null });
    expect(overviewNextStep({ project: project({ status: "approved", onboardingSubmittedAt: null }), movingTo: null }, NOW)).toEqual({ label: "Go live", anchor: "domain" });
  });

  it("uses the Website tab's next-step headline for every stage it shows", () => {
    for (const status of ["submitted", "building", "revisions", "approved"] as const) {
      const next = overviewNextStep({ project: project({ status, slaDueAt: null }), movingTo: null }, NOW);
      expect(next?.label, status).toBe(NEXT_STEP_HEADLINES[status]);
    }
  });

  it("is null when nothing waits on us", () => {
    expect(overviewNextStep({ project: project({ status: "preview" }), movingTo: null }, NOW)).toBeNull();
  });
});
