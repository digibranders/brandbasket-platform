import { describe, expect, it } from "vitest";
import { progressView, revisionDue, roundsLine, type ProgressInput } from "@/lib/website/progress-view";

function input(overrides: Partial<ProgressInput> = {}): ProgressInput {
  return { status: null, holdReason: null, roundsIncluded: 2, roundsGranted: 0, previewDue: null, liveBy: null, kickoffFirst: false, kickoffDay: null, ...overrides };
}

describe("progressView", () => {
  it("says nothing is being built when there is no project or it was cancelled", () => {
    expect(progressView(input({ status: null }))).toEqual({ kind: "none", title: "Nothing is being built right now", line: null });
    expect(progressView(input({ status: "cancelled" })).kind).toBe("none");
  });

  it("asks for the setup while onboarding", () => {
    expect(progressView(input({ status: "onboarding" }))).toEqual({
      kind: "setup",
      title: "Finish your setup",
      line: "We start building once your setup is in.",
    });
  });

  it("waits for the kickoff call, with no setup to finish, for a customer who answered the first questions", () => {
    expect(progressView(input({ status: "onboarding", kickoffFirst: true }))).toEqual({
      kind: "kickoff",
      title: "We start after your kickoff call",
      line: "Book your call and we start building straight after it.",
    });
    expect(progressView(input({ status: "onboarding", kickoffFirst: true, kickoffDay: "2026-11-02" })).line).toBe("Your call is on Mon 2 Nov. We start building straight after it.");
    expect(progressView(input({ status: "building", kickoffFirst: true })).kind).toBe("building");
  });

  it("gives the first preview date while building", () => {
    expect(progressView(input({ status: "building", previewDue: "2026-11-02" }))).toEqual({
      kind: "building",
      title: "We are building your website",
      line: "Your first preview will be ready by Mon 2 Nov.",
    });
    expect(progressView(input({ status: "submitted", previewDue: "2026-11-02" })).kind).toBe("building");
  });

  it("leaves the building line empty when no preview date is known", () => {
    expect(progressView(input({ status: "building", previewDue: null })).line).toBeNull();
  });

  it("shows the pause reason the team wrote", () => {
    expect(progressView(input({ status: "on_hold", holdReason: "We need your logo file." }))).toEqual({
      kind: "paused",
      title: "Your build is paused",
      line: "We need your logo file.",
    });
  });

  it("falls back to a plain line when a pause has no reason", () => {
    expect(progressView(input({ status: "on_hold", holdReason: null }))).toEqual({
      kind: "paused",
      title: "Your build is paused",
      line: "We will be in touch about what we need from you.",
    });
  });

  it("explains the preview; the rounds still included sit under the feedback box", () => {
    expect(progressView(input({ status: "preview", roundsIncluded: 2, roundsGranted: 1 }))).toEqual({
      kind: "preview",
      title: "Your preview is ready",
      line: "Look through it on your phone and on a computer. Then approve it, or tell us what to change.",
    });
  });

  it("gives the updated preview date while revising", () => {
    expect(progressView(input({ status: "revisions", previewDue: "2026-11-05" }))).toEqual({
      kind: "revising",
      title: "We are making your changes",
      line: "Your updated preview will be ready by Thu 5 Nov.",
    });
    expect(progressView(input({ status: "revisions", previewDue: null })).line).toBeNull();
  });

  it("gives the live date once approved", () => {
    expect(progressView(input({ status: "approved", liveBy: "2026-11-05" }))).toEqual({
      kind: "approved",
      title: "You approved the preview",
      line: "We are putting your website live. It should be up by Thu 5 Nov.",
    });
    expect(progressView(input({ status: "approved", liveBy: null })).line).toBe("We are putting your website live.");
  });

  it("says the website is live", () => {
    expect(progressView(input({ status: "live" }))).toEqual({ kind: "live", title: "Your website is live", line: null });
  });
});

describe("roundsLine", () => {
  it("counts the rounds still included", () => {
    expect(roundsLine(2, 0)).toBe("Two rounds of changes are included.");
    expect(roundsLine(2, 1)).toBe("One round of changes is included.");
  });

  it("quotes further changes once the rounds are used up", () => {
    expect(roundsLine(2, 2)).toBe("Further changes are quoted first.");
    expect(roundsLine(2, 3)).toBe("Further changes are quoted first.");
  });
});

describe("revisionDue", () => {
  it("adds two working days to the day the change was asked for", () => {
    // Tue 3 Nov asked: Wed 4 and Thu 5 Nov.
    expect(revisionDue("2026-11-03")).toBe("2026-11-05");
  });
});
