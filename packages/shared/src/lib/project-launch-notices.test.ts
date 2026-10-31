import { describe, expect, it } from "vitest";
import {
  PROJECT_LAUNCH_NOTICES,
  projectLaunchNoticeHref,
  readProjectLaunchNotice,
  type ProjectLaunchNotice,
} from "./project-launch-notices";

describe("project launch notices", () => {
  it("accepts every notice id through the page's query string", () => {
    for (const notice of Object.keys(PROJECT_LAUNCH_NOTICES) as ProjectLaunchNotice[]) {
      const url = new URL(projectLaunchNoticeHref("0192f3c4-1111-7000-8000-000000000001", notice), "http://admin.localhost");
      expect(readProjectLaunchNotice(url.searchParams.get("launch") ?? undefined)).toBe(notice);
    }
  });

  it.each([undefined, "", "toString", "__proto__", "<script>", ["checks-saved", "checks-saved"]])("ignores anything else (%s)", (value) => {
    expect(readProjectLaunchNotice(value)).toBeNull();
  });

  it("marks only the saved checks, the resent email and the saved free address as successes", () => {
    const successes = Object.entries(PROJECT_LAUNCH_NOTICES)
      .filter(([, notice]) => notice.ok)
      .map(([key]) => key);
    expect(successes.sort()).toEqual(["address-saved", "check-ok", "checks-saved", "launched", "launched-no-email", "resent"].sort());
  });
});
