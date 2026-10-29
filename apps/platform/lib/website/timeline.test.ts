import { describe, expect, it } from "vitest";
import { currentStep, liveDate, websiteTimeline, type StepKey, type TimelineEvent, type TimelineInput, type TimelineProject, type TimelineStep } from "@/lib/website/timeline";

// India is UTC+5:30: 14:00 IST is 08:30Z and 10:00 IST is 04:30Z.
const at = (iso: string): Date => new Date(iso);
const CALL = at("2026-10-27T08:30:00.000Z"); // Tue 27 Oct, 14:00 IST
const PREVIEW = at("2026-11-02T04:30:00.000Z"); // Mon 2 Nov, 10:00 IST
const BEFORE_CALL = at("2026-10-26T06:30:00.000Z"); // Mon 26 Oct, 12:00 IST

function project(overrides: Partial<TimelineProject> = {}): TimelineProject {
  return { status: "onboarding", onboardingSubmittedAt: null, slaDueAt: null, previewSentAt: null, launchedAt: null, ...overrides };
}

function input(overrides: Partial<TimelineInput> & { readonly project: TimelineProject }): TimelineInput {
  return { events: [], callStartsAt: CALL, now: BEFORE_CALL, ...overrides };
}

function event(status: TimelineEvent["status"], iso: string): TimelineEvent {
  return { status, at: at(iso) };
}

function row(steps: readonly TimelineStep[], key: StepKey): TimelineStep {
  const found = steps.find((step) => step.key === key);
  if (found === undefined) throw new Error(`No ${key} row`);
  return found;
}

function states(steps: readonly TimelineStep[]): readonly string[] {
  return steps.map((step) => step.state);
}

describe("websiteTimeline", () => {
  it("shows the call as now before it happens, and the live date from the call", () => {
    const steps = websiteTimeline(input({ project: project({ status: "onboarding" }) }));
    expect(states(steps)).toEqual(["now", "next", "next", "next"]);
    expect(row(steps, "call").when).toBe("Tue 27 Oct");
    expect(row(steps, "live").when).toBe("By Thu 5 Nov");
  });

  it("shows the build with its promise, and no start note once building has begun", () => {
    const steps = websiteTimeline(
      input({
        project: project({ status: "building", slaDueAt: PREVIEW }),
        events: [event("submitted", "2026-10-27T05:00:00.000Z"), event("building", "2026-10-28T04:30:00.000Z")],
        now: at("2026-10-28T06:00:00.000Z"),
      }),
    );
    expect(states(steps)).toEqual(["done", "now", "next", "next"]);
    expect(row(steps, "call")).toMatchObject({ state: "done", when: "Tue 27 Oct" });
    expect(row(steps, "build")).toEqual({
      key: "build",
      title: "We build your website",
      note: null,
      when: "By Mon 2 Nov",
      state: "now",
    });
    expect(row(steps, "live").when).toBe("By Thu 5 Nov");
  });

  it("shows a single day when the build started and ended on the same day", () => {
    const steps = websiteTimeline(
      input({
        project: project({ status: "preview", previewSentAt: at("2026-10-28T09:00:00.000Z") }),
        events: [event("building", "2026-10-28T04:30:00.000Z")],
        now: at("2026-10-28T10:00:00.000Z"),
      }),
    );
    expect(row(steps, "build").when).toBe("28 Oct");
  });

  it("tells a submitted project that we start within 48 hours of the call", () => {
    const steps = websiteTimeline(
      input({
        project: project({ status: "submitted", slaDueAt: PREVIEW }),
        events: [event("submitted", "2026-10-27T05:00:00.000Z")],
        now: at("2026-10-27T06:00:00.000Z"),
      }),
    );
    expect(row(steps, "build").note).toBe("We start within 48 hours of the call");
  });

  it("shows the preview day with the approval deadline and the build dates", () => {
    const steps = websiteTimeline(
      input({
        project: project({ status: "preview", previewSentAt: PREVIEW }),
        events: [event("submitted", "2026-10-27T05:00:00.000Z"), event("building", "2026-10-28T04:30:00.000Z"), event("preview", "2026-11-02T04:30:00.000Z")],
        now: at("2026-11-02T06:00:00.000Z"),
      }),
    );
    expect(states(steps)).toEqual(["done", "done", "now", "next"]);
    expect(row(steps, "build")).toMatchObject({ state: "done", when: "28 Oct to 2 Nov" });
    expect(row(steps, "check")).toMatchObject({ state: "now", when: "Today" });
    expect(row(steps, "live")).toMatchObject({ note: "If you approve by Wed 4 Nov", when: "By Thu 5 Nov" });
  });

  it("skips the weekend when the preview goes out on a Friday", () => {
    const friday = at("2026-11-06T04:30:00.000Z"); // Fri 6 Nov, 10:00 IST
    const steps = websiteTimeline(input({ project: project({ status: "preview", previewSentAt: friday }), now: friday }));
    expect(liveDate(input({ project: project({ status: "preview", previewSentAt: friday }), now: friday }))).toEqual({
      liveBy: "2026-11-11",
      approveBy: "2026-11-10",
    });
    expect(row(steps, "live")).toMatchObject({ note: "If you approve by Tue 10 Nov", when: "By Wed 11 Nov" });
  });

  it("moves the dates from the revision request and keeps the start note off the revision", () => {
    const steps = websiteTimeline(
      input({
        project: project({ status: "revisions", previewSentAt: PREVIEW }),
        events: [event("preview", "2026-11-02T04:30:00.000Z"), event("revisions", "2026-11-03T04:30:00.000Z")],
        now: at("2026-11-03T06:00:00.000Z"),
      }),
    );
    expect(row(steps, "build")).toEqual({
      key: "build",
      title: "We are making your changes",
      note: null,
      when: "By Thu 5 Nov",
      state: "now",
    });
    expect(row(steps, "live")).toMatchObject({ note: "If you approve by Mon 9 Nov", when: "By Tue 10 Nov" });
  });

  it("puts the live row as now once the customer has approved", () => {
    const steps = websiteTimeline(
      input({
        project: project({ status: "approved", previewSentAt: PREVIEW }),
        events: [event("preview", "2026-11-02T04:30:00.000Z"), event("approved", "2026-11-04T04:30:00.000Z")],
        now: at("2026-11-04T06:00:00.000Z"),
      }),
    );
    expect(states(steps)).toEqual(["done", "done", "done", "now"]);
    expect(row(steps, "live")).toEqual({ key: "live", title: "Your website is live", note: null, when: "By Thu 5 Nov", state: "now" });
  });

  it("marks every row done once the site is live", () => {
    const steps = websiteTimeline(
      input({
        project: project({ status: "live", previewSentAt: PREVIEW, launchedAt: at("2026-11-05T04:30:00.000Z") }),
        events: [event("preview", "2026-11-02T04:30:00.000Z"), event("approved", "2026-11-04T04:30:00.000Z"), event("live", "2026-11-05T04:30:00.000Z")],
        now: at("2026-11-05T06:00:00.000Z"),
      }),
    );
    expect(states(steps)).toEqual(["done", "done", "done", "done"]);
    expect(row(steps, "live")).toMatchObject({ when: "Thu 5 Nov", note: null });
  });

  it("keeps the build as now while on hold before a preview, with no start note", () => {
    const steps = websiteTimeline(input({ project: project({ status: "on_hold", slaDueAt: null }), now: at("2026-10-28T06:00:00.000Z") }));
    expect(states(steps)).toEqual(["done", "now", "next", "next"]);
    expect(row(steps, "build")).toEqual({ key: "build", title: "We build your website", note: null, when: "", state: "now" });
  });

  it("moves the check to now while on hold after a preview", () => {
    const steps = websiteTimeline(input({ project: project({ status: "on_hold", previewSentAt: PREVIEW }), now: at("2026-11-03T06:00:00.000Z") }));
    expect(states(steps)).toEqual(["done", "done", "now", "next"]);
  });

  it("promises no dates while a build is on hold, even with a due date and a call on file", () => {
    const before = websiteTimeline(input({ project: project({ status: "on_hold", slaDueAt: PREVIEW }), now: at("2026-11-03T06:00:00.000Z") }));
    expect(row(before, "build")).toMatchObject({ state: "now", when: "" });
    expect(row(before, "live")).toMatchObject({ when: "", note: null });
    const after = websiteTimeline(input({ project: project({ status: "on_hold", previewSentAt: PREVIEW }), now: at("2026-11-03T06:00:00.000Z") }));
    expect(row(after, "check")).toMatchObject({ state: "now", when: "" });
    expect(row(after, "live")).toMatchObject({ when: "", note: null });
  });

  it("shows no date and does not throw without a call or a submission", () => {
    const steps = websiteTimeline(input({ project: project({ status: "onboarding" }), callStartsAt: null }));
    expect(states(steps)).toEqual(["now", "next", "next", "next"]);
    expect(row(steps, "call").when).toBe("");
    expect(row(steps, "live").when).toBe("");
  });
});

describe("a launch day set by staff", () => {
  it("is the date the customer is told, in place of the working-day estimate", () => {
    const planned = project({ status: "preview", previewSentAt: PREVIEW, launchPlannedOn: "2026-11-12" });
    expect(liveDate(input({ project: planned, now: PREVIEW }))).toEqual({ liveBy: "2026-11-12", approveBy: null });
    const steps = websiteTimeline(input({ project: planned, now: PREVIEW }));
    expect(row(steps, "live").when).toBe("By Thu 12 Nov");
  });

  it("is not shown for a paused build, which has no promise, and is not used once the website is live", () => {
    expect(liveDate(input({ project: project({ status: "on_hold", launchPlannedOn: "2026-11-12" }) }))).toBeNull();
    const live = project({ status: "live", launchedAt: at("2026-11-10T04:30:00.000Z"), launchPlannedOn: "2026-11-12" });
    expect(row(websiteTimeline(input({ project: live })), "live").when).not.toContain("12 Nov");
  });
});

describe("currentStep", () => {
  it("does not count a call in the future as done", () => {
    expect(currentStep(input({ project: project({ status: "onboarding" }), now: BEFORE_CALL }))).toBe(0);
    expect(currentStep(input({ project: project({ status: "onboarding" }), now: at("2026-10-27T09:00:00.000Z") }))).toBe(1);
  });
});
