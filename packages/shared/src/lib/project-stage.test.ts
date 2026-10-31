import { describe, expect, it } from "vitest";
import { STAFF_STAGE_LABELS, staffStageOf } from "./project-stage";

const STATUSES = ["onboarding", "submitted", "building", "preview", "revisions", "approved", "live", "on_hold", "cancelled"] as const;

describe("staffStageOf", () => {
  it("names every database status, and keeps submitted apart from building", () => {
    expect(STATUSES.map(staffStageOf)).toEqual([
      "waiting_for_kickoff",
      "ready_to_start",
      "building",
      "awaiting_review",
      "changes_requested",
      "approved",
      "live",
      "on_hold",
      "cancelled",
    ]);
  });

  it("has a label for every stage, with no dashes", () => {
    for (const status of STATUSES) {
      const label = STAFF_STAGE_LABELS[staffStageOf(status)];
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(/[–—]/);
    }
  });
});
