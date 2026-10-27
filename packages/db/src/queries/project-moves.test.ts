import { describe, expect, it } from "vitest";
import { canMoveProject, PROJECT_MOVE_FROM } from "./project-moves";

describe("canMoveProject", () => {
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
