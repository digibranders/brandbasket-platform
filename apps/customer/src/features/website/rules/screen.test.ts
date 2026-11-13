import { describe, expect, it } from "vitest";
import { websiteProgress, type ProjectFacts } from "./screen";

const NOW = new Date("2026-11-03T06:00:00.000Z"); // Tue 3 Nov, 11:30 IST

function project(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return { status: "building", onHoldReason: null, onboardingSubmittedAt: null, slaDueAt: null, previewSentAt: null, launchedAt: null, launchPlannedOn: null, ...overrides };
}

describe("websiteProgress", () => {
  it("is nothing being built without a project, with no steps", () => {
    expect(websiteProgress({ project: null, history: null, kickoffFirst: false, now: NOW })).toMatchObject({ view: { kind: "none" }, steps: null });
  });

  it("promises the first preview from the due date while it is ahead, and drops it once passed", () => {
    const ahead = websiteProgress({ project: project({ slaDueAt: new Date("2026-11-05T06:00:00.000Z") }), history: { events: [], callStartsAt: null }, kickoffFirst: false, now: NOW });
    expect(ahead.view.line).toBe("Your first preview will be ready by Thu 5 Nov.");
    const passed = websiteProgress({ project: project({ slaDueAt: new Date("2026-11-02T06:00:00.000Z") }), history: { events: [], callStartsAt: null }, kickoffFirst: false, now: NOW });
    expect(passed.view.line).toBeNull();
  });

  it("promises the updated preview two working days after the last ask", () => {
    const progress = websiteProgress({
      project: project({ status: "revisions" }),
      history: { events: [{ status: "revisions", at: new Date("2026-11-03T04:30:00.000Z") }], callStartsAt: null },
      kickoffFirst: false,
      now: NOW,
    });
    expect(progress.view.line).toBe("Your updated preview will be ready by Thu 5 Nov.");
  });

  it("keeps the view but leaves out the steps when the history could not be read", () => {
    const progress = websiteProgress({ project: project({ status: "preview" }), history: null, kickoffFirst: false, now: NOW });
    expect(progress.view.kind).toBe("preview");
    expect(progress.steps).toBeNull();
  });

  it("names the kickoff day for a customer who answered the first questions", () => {
    const progress = websiteProgress({
      project: project({ status: "onboarding" }),
      history: { events: [], callStartsAt: new Date("2026-11-05T05:30:00.000Z") },
      kickoffFirst: true,
      now: NOW,
    });
    expect(progress.view).toMatchObject({ kind: "kickoff", line: "Your call is on Thu 5 Nov. We start building straight after it." });
  });
});
