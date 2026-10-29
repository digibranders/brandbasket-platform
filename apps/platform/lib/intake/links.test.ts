import { describe, expect, it } from "vitest";
import { INTAKE_SUMMARY_STEP, personalizeHref } from "@/lib/intake/links";

describe("personalizeHref", () => {
  it("names the basket with plain commas, and the step when there is one", () => {
    expect(personalizeHref(["managed-website", "digital-growth"])).toBe("/personalize?services=managed-website,digital-growth");
    expect(personalizeHref(["local-seo-aeo"], "searchScope")).toBe("/personalize?services=local-seo-aeo&q=searchScope");
    expect(personalizeHref(["managed-website"], INTAKE_SUMMARY_STEP)).toBe("/personalize?services=managed-website&q=summary");
  });
});
