import type { ProjectStatus } from "@fynix/db";
import { describe, expect, it } from "vitest";
import { nextStep } from "./next-step";

const DUE = new Date("2026-09-18T09:30:00Z");

function project(status: ProjectStatus, slaDueAt: Date | null = null) {
  return { status, slaDueAt };
}

describe("nextStep", () => {
  it("asks a customer with nothing done to start", () => {
    expect(nextStep({ project: project("onboarding"), completedSteps: [], liveWebsite: null })).toEqual({
      kind: "start-onboarding",
    });
  });

  it("counts the completed steps out of all five", () => {
    expect(nextStep({ project: project("onboarding"), completedSteps: ["business", "domain"], liveWebsite: null })).toEqual({
      kind: "continue-onboarding",
      completed: 2,
      total: 5,
    });
  });

  it("does not count a step twice", () => {
    expect(
      nextStep({ project: project("onboarding"), completedSteps: ["business", "business"], liveWebsite: null }),
    ).toEqual({ kind: "continue-onboarding", completed: 1, total: 5 });
  });

  it.each(["submitted", "building"] as const)("shows the build and its due date while %s", (status) => {
    expect(nextStep({ project: project(status, DUE), completedSteps: [], liveWebsite: null })).toEqual({
      kind: "building",
      slaDueAt: DUE,
    });
  });

  it("keeps the building card when no due date is set", () => {
    expect(nextStep({ project: project("building"), completedSteps: [], liveWebsite: null })).toEqual({
      kind: "building",
      slaDueAt: null,
    });
  });

  it("says when the build is on hold", () => {
    expect(nextStep({ project: project("on_hold", DUE), completedSteps: [], liveWebsite: null })).toEqual({
      kind: "on-hold",
    });
  });

  it.each(["preview", "revisions", "approved", "cancelled"] as const)("shows nothing while %s", (status) => {
    expect(nextStep({ project: project(status, DUE), completedSteps: ["business"], liveWebsite: null })).toEqual({
      kind: "none",
    });
  });

  it("shows nothing without an open project", () => {
    expect(nextStep({ project: null, completedSteps: [], liveWebsite: null })).toEqual({ kind: "none" });
  });

  // A live project is no longer an open one, so the live site arrives on its own and `project` is null beside it.
  it("hands the live site over once it is live", () => {
    expect(nextStep({ project: null, completedSteps: [], liveWebsite: { hostname: "bloom.in" } })).toEqual({
      kind: "live",
      hostname: "bloom.in",
    });
  });

  it("puts the live site ahead of anything still open", () => {
    expect(
      nextStep({ project: project("building", DUE), completedSteps: [], liveWebsite: { hostname: "bloom.in" } }),
    ).toEqual({ kind: "live", hostname: "bloom.in" });
  });
});
