import { describe, expect, it } from "vitest";
import { PROJECT_MOVE_NOTICES, projectMoveNoticeHref, readProjectMoveNotice } from "./project-move-notices";

describe("project move notices", () => {
  it("links back to the client's Project tab with the notice", () => {
    expect(projectMoveNoticeHref("b1", "held")).toBe("/clients/b1/project?move=held");
  });

  it("reads only a known notice, never free text", () => {
    expect(readProjectMoveNotice("held")).toBe("held");
    expect(readProjectMoveNotice("<script>")).toBeNull();
    expect(readProjectMoveNotice(["held"])).toBeNull();
    expect(readProjectMoveNotice(undefined)).toBeNull();
  });

  it("has a sentence and a tone for every notice", () => {
    for (const notice of Object.values(PROJECT_MOVE_NOTICES)) {
      expect(notice.text.length).toBeGreaterThan(10);
      expect(notice.text).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
