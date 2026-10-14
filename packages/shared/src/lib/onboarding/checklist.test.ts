import { describe, expect, it } from "vitest";
import { firstMissing, onboardingChecklist, type ChecklistInput } from "./checklist";

const complete: ChecklistInput = {
  displayName: "Bloom Dental",
  phone: "+91 98765 43210",
  email: null,
  serviceCount: 3,
  logoCount: 0,
  photoCount: 4,
  undescribedPhotoCount: 0,
  domain: { hostname: "bloom.in", ownerConfirmed: true },
};

function failing(input: ChecklistInput): string[] {
  return onboardingChecklist(input)
    .filter((item) => !item.passed)
    .map((item) => item.key);
}

describe("onboardingChecklist", () => {
  it("passes a complete onboarding", () => {
    expect(failing(complete)).toEqual([]);
    expect(firstMissing(onboardingChecklist(complete))).toBeNull();
  });

  it("needs a business name that isn't blank", () => {
    expect(failing({ ...complete, displayName: null })).toEqual(["business-name"]);
    expect(failing({ ...complete, displayName: "   " })).toEqual(["business-name"]);
  });

  it("accepts either a phone or an email, but not neither", () => {
    expect(failing({ ...complete, phone: null, email: "hi@bloom.in" })).toEqual([]);
    expect(failing({ ...complete, phone: null, email: null })).toEqual(["contact"]);
  });

  it("needs a service", () => {
    expect(failing({ ...complete, serviceCount: 0 })).toEqual(["services"]);
  });

  it("accepts a logo alone or photos alone, but not nothing", () => {
    expect(failing({ ...complete, photoCount: 0, logoCount: 1 })).toEqual([]);
    expect(failing({ ...complete, photoCount: 0, logoCount: 0 })).toEqual(["images"]);
  });

  it("needs every photo described", () => {
    expect(failing({ ...complete, undescribedPhotoCount: 1 })).toEqual(["photo-descriptions"]);
  });

  it("needs a domain the customer has confirmed as theirs", () => {
    expect(failing({ ...complete, domain: null })).toEqual(["domain"]);
    expect(failing({ ...complete, domain: { hostname: "bloom.in", ownerConfirmed: false } })).toEqual(["domain"]);
  });

  it("reports the first missing item in step order, with the step to send them to", () => {
    const missing = firstMissing(onboardingChecklist({ ...complete, serviceCount: 0, domain: null }));
    expect(missing).toMatchObject({ key: "services", step: "content" });
  });
});
