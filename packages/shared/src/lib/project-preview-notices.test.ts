import { describe, expect, it } from "vitest";
import {
  PROJECT_PREVIEW_NOTICES,
  projectPreviewNoticeHref,
  readProjectPreviewNotice,
  type ProjectPreviewNotice,
} from "./project-preview-notices";

describe("project preview notices", () => {
  it("accepts every notice id through the page's query string", () => {
    for (const notice of Object.keys(PROJECT_PREVIEW_NOTICES) as ProjectPreviewNotice[]) {
      const url = new URL(projectPreviewNoticeHref("0192f3c4-1111-7000-8000-000000000001", notice), "http://admin.localhost");
      expect(readProjectPreviewNotice(url.searchParams.get("preview") ?? undefined)).toBe(notice);
    }
  });

  it.each([undefined, "", "toString", "__proto__", "<script>", ["resent", "resent"]])("ignores anything else (%s)", (value) => {
    expect(readProjectPreviewNotice(value)).toBeNull();
  });

  it("marks the email outcomes that need a resend as failures", () => {
    expect(PROJECT_PREVIEW_NOTICES["sent-email-failed"].ok).toBe(false);
    expect(PROJECT_PREVIEW_NOTICES["resend-failed"].ok).toBe(false);
    expect(PROJECT_PREVIEW_NOTICES["resend-not-allowed"].ok).toBe(false);
    expect(PROJECT_PREVIEW_NOTICES.resent.ok).toBe(true);
  });
});
