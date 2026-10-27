import { describe, expect, it } from "vitest";
import { PROJECT_MOVE_NOTICES, projectMoveNoticeHref, readProjectMoveNotice } from "./project-move-notices";

describe("project move notices", () => {
  it("links back to the client's Project tab with the notice", () => {
    expect(projectMoveNoticeHref("b1", "cancelled")).toBe("/clients/b1/project?move=cancelled");
  });

  it("reads only a known notice, never free text", () => {
    expect(readProjectMoveNotice("cancelled")).toBe("cancelled");
    expect(readProjectMoveNotice("<script>")).toBeNull();
    expect(readProjectMoveNotice(["cancelled"])).toBeNull();
    expect(readProjectMoveNotice(undefined)).toBeNull();
  });

  it("has a sentence and a tone for every notice", () => {
    for (const notice of Object.values(PROJECT_MOVE_NOTICES)) {
      expect(notice.text.length).toBeGreaterThan(10);
      expect(notice.text).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
