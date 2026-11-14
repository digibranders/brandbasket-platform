import { describe, expect, it } from "vitest";
import { KICKOFF_NOTIFICATION_REPEAT_MS, shouldShowKickoffPrompt } from "./kickoff-prompt-rule";

describe("shouldShowKickoffPrompt repeat rule", () => {
  const NOW = 1000000000;

  it("does not show when there are no pending kickoff calls", () => {
    expect(shouldShowKickoffPrompt({ hasPending: false, dismissedAt: null, now: NOW })).toBe(false);
  });

  it("shows immediately when there is a pending call and it has not been dismissed", () => {
    expect(shouldShowKickoffPrompt({ hasPending: true, dismissedAt: null, now: NOW })).toBe(true);
  });

  it("stays hidden while within the repeat interval after being dismissed", () => {
    const recentDismiss = NOW - (KICKOFF_NOTIFICATION_REPEAT_MS - 1000);
    expect(shouldShowKickoffPrompt({ hasPending: true, dismissedAt: recentDismiss, now: NOW })).toBe(false);
  });

  it("repeats once the repeat interval has passed until answered", () => {
    const pastRepeat = NOW - KICKOFF_NOTIFICATION_REPEAT_MS;
    expect(shouldShowKickoffPrompt({ hasPending: true, dismissedAt: pastRepeat, now: NOW })).toBe(true);
  });

  it("stops repeating once the prompt is answered (no more pending)", () => {
    const pastRepeat = NOW - KICKOFF_NOTIFICATION_REPEAT_MS;
    expect(shouldShowKickoffPrompt({ hasPending: false, dismissedAt: pastRepeat, now: NOW })).toBe(false);
  });
});
