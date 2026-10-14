import { describe, expect, it } from "vitest";
import { echoedValue, formValues, initialStepFormState, refusedStepState, type StepFormState } from "./form-state";

describe("formValues", () => {
  it("keeps text fields and drops files and framework fields", () => {
    const data = new FormData();
    data.append("displayName", "Bloom Dental");
    data.append("hours.0.closed", "on");
    data.append("$ACTION_ID_abc", "");
    data.append("$ACTION_REF_1", "");
    data.append("logo", new Blob(["x"]), "logo.png");
    expect(formValues(data)).toEqual({ displayName: "Bloom Dental", "hours.0.closed": "on" });
  });
});

describe("echoedValue", () => {
  const error: StepFormState = { status: "error", message: "Check this.", field: "phone", values: { phone: "12" } };

  it("uses the saved value before anything was sent", () => {
    expect(echoedValue(initialStepFormState, "phone", "+91 98765 43210")).toBe("+91 98765 43210");
    expect(echoedValue(initialStepFormState, "phone", null)).toBe("");
  });

  it("uses what was typed after a refused save, even where it was left empty", () => {
    expect(echoedValue(error, "phone", "+91 98765 43210")).toBe("12");
    expect(echoedValue(error, "email", "saved@example.com")).toBe("");
  });
});

describe("refusedStepState", () => {
  it("carries the message, the field and what was typed", () => {
    const data = new FormData();
    data.append("domain", "bloom");
    expect(refusedStepState({ message: "Not a domain.", field: "domain" }, data)).toEqual({
      status: "error",
      message: "Not a domain.",
      field: "domain",
      values: { domain: "bloom" },
    });
  });

  it("keeps a link to the step that needs fixing", () => {
    expect(
      refusedStepState({ message: "Missing.", field: null, fixHref: "/onboarding/domain" }, new FormData()),
    ).toMatchObject({ fixHref: "/onboarding/domain" });
  });
});
