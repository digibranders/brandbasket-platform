import { describe, expect, it } from "vitest";
import {
  ANSWER_STEPS,
  firstIncompleteStep,
  hrefAfter,
  ONBOARDING_STEPS,
  onboardingStepHref,
  stepAfter,
  stepInfo,
} from "./steps";

describe("onboarding steps", () => {
  it("lists five steps ending with the review", () => {
    expect(ONBOARDING_STEPS.map((step) => step.key)).toEqual(["business", "content", "brand", "domain", "review"]);
    expect(ANSWER_STEPS).not.toContain("review");
  });

  it("links each step under /onboarding", () => {
    expect(onboardingStepHref("brand")).toBe("/onboarding/brand");
  });

  it("knows what comes next", () => {
    expect(stepAfter("business")).toBe("content");
    expect(stepAfter("domain")).toBe("review");
    expect(stepAfter("review")).toBeNull();
  });

  it("continues from the first unanswered step, then the review", () => {
    expect(firstIncompleteStep(new Set())).toBe("business");
    expect(firstIncompleteStep(new Set(["business", "brand"]))).toBe("content");
    expect(firstIncompleteStep(new Set(["business", "content", "brand", "domain"]))).toBe("review");
  });

  it("describes a step", () => {
    expect(stepInfo("domain").title).toBe("Your domain");
  });
});

describe("hrefAfter", () => {
  it("moves each answer step on to the next page, ending at the review", () => {
    expect(hrefAfter("business")).toBe("/onboarding/content");
    expect(hrefAfter("domain")).toBe("/onboarding/review");
    expect(hrefAfter("review")).toBe("/onboarding/review");
  });
});
