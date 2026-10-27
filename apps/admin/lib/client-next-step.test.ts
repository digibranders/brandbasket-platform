import type { ClientProject } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { clientNextStep, overviewNextStep, previewLateReason } from "./client-next-step";

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
  it("is nothing before setup is sent", () => {
    expect(clientNextStep(null)).toBeNull();
    expect(clientNextStep(project({ onboardingSubmittedAt: null }))).toBeNull();
  });

  it("is the preview while we build, and going live once approved", () => {
    expect(clientNextStep(project({ status: "submitted" }))).toBe("preview");
    expect(clientNextStep(project({ status: "building" }))).toBe("preview");
    expect(clientNextStep(project({ status: "revisions" }))).toBe("preview");
    expect(clientNextStep(project({ status: "approved" }))).toBe("live");
    expect(clientNextStep(project({ status: "preview" }))).toBeNull();
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

  it("names the late preview, then going live", () => {
    expect(overviewNextStep({ project: project({}), movingTo: null }, NOW)).toEqual({ label: "Send the preview: preview 2 days late", anchor: null });
    expect(overviewNextStep({ project: project({ slaDueAt: null }), movingTo: null }, NOW)).toEqual({ label: "Send the preview", anchor: null });
    expect(overviewNextStep({ project: project({ status: "approved" }), movingTo: null }, NOW)).toEqual({ label: "Go live", anchor: "domain" });
  });

  it("is null when nothing waits on us", () => {
    expect(overviewNextStep({ project: project({ status: "preview" }), movingTo: null }, NOW)).toBeNull();
  });
});
