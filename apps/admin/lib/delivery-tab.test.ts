import { describe, expect, it } from "vitest";
import { dueDateLabel, NEXT_STEP_HEADLINES, roundName, roundsText, updatedPreviewDay, updatedPreviewLateReason } from "./delivery-tab";

describe("updatedPreviewDay", () => {
  it("is two working days after the day the changes were asked, in India", () => {
    // Mon 2 Nov 2026, 15:30 in India.
    expect(updatedPreviewDay(new Date("2026-11-02T10:00:00Z"))).toBe("2026-11-04");
  });

  it("counts the India day, not the UTC day", () => {
    // Mon 2 Nov, 23:30 UTC is Tue 3 Nov 05:00 in India, so the promise is Thu 5 Nov.
    expect(updatedPreviewDay(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-05");
  });

  it("skips the weekend", () => {
    // Fri 30 Oct 2026 in India: Mon 2 Nov and Tue 3 Nov.
    expect(updatedPreviewDay(new Date("2026-10-30T10:00:00Z"))).toBe("2026-11-03");
  });
});

describe("updatedPreviewLateReason", () => {
  it("is not late during the promised day, even at its last minute in India", () => {
    expect(updatedPreviewLateReason("2026-11-04", new Date("2026-11-04T00:00:00+05:30"))).toBeNull();
    expect(updatedPreviewLateReason("2026-11-04", new Date("2026-11-04T23:59:00+05:30"))).toBeNull();
  });

  it("says overdue on the day after, then counts days", () => {
    expect(updatedPreviewLateReason("2026-11-04", new Date("2026-11-05T10:00:00+05:30"))).toBe("Preview overdue");
    expect(updatedPreviewLateReason("2026-11-04", new Date("2026-11-06T10:00:00+05:30"))).toBe("Preview 1 day late");
    expect(updatedPreviewLateReason("2026-11-04", new Date("2026-11-07T10:00:00+05:30"))).toBe("Preview 2 days late");
  });
});

describe("the card's words", () => {
  it("has one headline per stage", () => {
    expect(NEXT_STEP_HEADLINES.revisions).toBe("Make the customer's changes");
    expect(NEXT_STEP_HEADLINES.live).toBe("Nothing needed");
  });

  it("names the due date for the stage", () => {
    expect(dueDateLabel("building")).toBe("First preview due");
    expect(dueDateLabel("revisions")).toBe("Updated preview due");
    expect(dueDateLabel("preview")).toBeNull();
  });

  it("writes rounds and round names", () => {
    expect(roundsText(1, 2)).toBe("1 of 2");
    expect(roundName(3)).toBe("Round 3");
  });
});
