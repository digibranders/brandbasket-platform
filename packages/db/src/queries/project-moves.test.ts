import { describe, expect, it } from "vitest";
import { canMoveProject, PROJECT_MOVE_FROM } from "./project-moves";

describe("canMoveProject", () => {
  it("starts building only from submitted", () => {
    expect(canMoveProject("start-building", "submitted")).toBe(true);
    expect(canMoveProject("start-building", "onboarding")).toBe(false);
    expect(canMoveProject("start-building", "building")).toBe(false);
  });

  it("puts any open build on hold, but not one already on hold, live or cancelled", () => {
    for (const status of ["onboarding", "submitted", "building", "preview", "revisions", "approved"] as const) {
      expect(canMoveProject("hold", status)).toBe(true);
    }
    expect(canMoveProject("hold", "on_hold")).toBe(false);
    expect(canMoveProject("hold", "live")).toBe(false);
    expect(canMoveProject("hold", "cancelled")).toBe(false);
  });

  it("resumes only a build on hold", () => {
    expect(canMoveProject("resume", "on_hold")).toBe(true);
    expect(canMoveProject("resume", "building")).toBe(false);
  });

  it("cancels and assigns any open build, including one on hold", () => {
    expect(canMoveProject("cancel", "on_hold")).toBe(true);
    expect(canMoveProject("assign", "on_hold")).toBe(true);
    expect(canMoveProject("cancel", "live")).toBe(false);
    expect(canMoveProject("assign", "cancelled")).toBe(false);
  });

  it("adds a round of changes only once a preview has been sent", () => {
    expect(canMoveProject("grant-round", "preview")).toBe(true);
    expect(canMoveProject("grant-round", "revisions")).toBe(true);
    expect(canMoveProject("grant-round", "approved")).toBe(true);
    expect(canMoveProject("grant-round", "building")).toBe(false);
  });

  it("never lets a move start from live or cancelled", () => {
    for (const statuses of Object.values(PROJECT_MOVE_FROM)) {
      expect(statuses).not.toContain("live");
      expect(statuses).not.toContain("cancelled");
    }
  });
});
