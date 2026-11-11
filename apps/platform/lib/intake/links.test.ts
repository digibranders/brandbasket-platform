import { describe, expect, it } from "vitest";
import { INTAKE_SUMMARY_STEP, personalizeHref } from "@/lib/intake/links";

describe("personalizeHref", () => {
  it("names the basket with plain commas, and the step when there is one", () => {
    expect(personalizeHref(["managed-website", "social-media"])).toBe("/personalize?services=managed-website,social-media");
    expect(personalizeHref(["paid-ads"], "searchScope")).toBe("/personalize?services=paid-ads&q=searchScope");
    expect(personalizeHref(["managed-website"], INTAKE_SUMMARY_STEP)).toBe("/personalize?services=managed-website&q=summary");
  });
});
